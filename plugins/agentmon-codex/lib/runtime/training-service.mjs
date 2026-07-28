import { resolve } from "node:path";
import { persistAgentmonSnapshot } from "../../scripts/agentmon-db.mjs";
import { ENGINE_VERSION, VALID_PROVIDERS, VALID_ROLES, atomicWrite, growthProfile, loadEngine, pathsFor, readAgentmonState, readJson, safeSlot, sourcesFromFeed, validateFeed, writeJson } from "./storage.mjs";

function configFromOptions(options, existingConfig, existingAgent, createAgentInput) {
  const role = options.role || existingConfig?.role || "builder";
  if (!VALID_ROLES.has(role)) throw new Error(`Unknown role: ${role}`);
  const provider = options.provider || existingConfig?.provider || existingAgent?.provider || "openai";
  if (!VALID_PROVIDERS.has(provider)) throw new Error(`Unknown provider: ${provider}`);
  const defaults = createAgentInput(role);
  return {
    name: options.name || existingConfig?.name || existingAgent?.trainerName || defaults.name,
    provider,
    model: options.model || existingConfig?.model || existingAgent?.model || defaults.model,
    role,
    mission: options.mission || existingConfig?.mission || existingAgent?.mission || defaults.mission,
    skills: existingConfig?.skills || defaults.skills,
    nameSeed: existingConfig?.nameSeed || options.nameSeed || options.slot || "main",
  };
}

function ledgerEntry(feed, previous, agentmon, previousPromptIds, calibrationRevision = null) {
  const currentPromptIds = feed.prompts.map((prompt, index) => String(prompt.id || `prompt-${index + 1}`));
  const previousSet = new Set(previousPromptIds);
  return {
    engineVersion: ENGINE_VERSION,
    revision: feed.revision,
    calibrationRevision,
    observedAt: feed.generatedAt || new Date().toISOString(),
    trainedAt: agentmon.trainedAt,
    source: {
      adapter: feed.source || "unknown",
      taskId: feed.thread?.id || null,
      taskLabel: feed.thread?.label || null,
      promptCount: feed.totals?.prompts ?? currentPromptIds.length,
      characterCount: feed.totals?.characters ?? agentmon.trainingBytes,
      redactions: feed.totals?.redactions ?? 0,
      rawPromptTextStored: false,
    },
    change: {
      addedPromptIds: currentPromptIds.filter((id) => !previousSet.has(id)),
      confidenceBefore: growthProfile(previous)?.confidence ?? 0,
      confidenceAfter: growthProfile(agentmon).confidence,
    },
    learned: {
      promptprintSignature: agentmon.promptprint.signature,
      archetype: agentmon.promptprint.archetype,
      skills: agentmon.learnedSkills.map(({ id, evidence }) => ({ id, evidence })),
      candidates: (agentmon.skillCandidates || []).map(({ id, stage, evidenceCount, behavioralEvidenceCount, weightedEvidence, confidence }) => ({ id, stage, evidenceCount, behavioralEvidenceCount, weightedEvidence, confidence })),
      procedures: (agentmon.proceduralSkills || []).map(({ id, stage, evidenceCount, behavioralEvidenceCount, confidence, trainerReview }) => ({ id, stage, evidenceCount, behavioralEvidenceCount, confidence, trainerReview })),
      intentCounts: Object.fromEntries([...new Set((agentmon.observations || []).map((observation) => observation.intent))].map((intent) => [intent, agentmon.observations.filter((observation) => observation.intent === intent).length])),
      correctedEpisodes: (agentmon.decisionEpisodes || []).filter((episode) => episode.resolution.status === "trainer-corrected").length,
      hypotheses: (agentmon.behaviorHypotheses || []).map(({ id, status, confidence, evidenceFor, evidenceAgainst }) => ({ id, status, confidence, evidenceFor: evidenceFor.length, evidenceAgainst: evidenceAgainst.length })),
      arena: agentmon.arenaReport,
      hatchReadiness: agentmon.hatchReadiness,
      combinations: agentmon.combinations.map(({ id }) => id),
      loops: agentmon.loops.map(({ id, evidence }) => ({ id, evidence })),
      fusions: agentmon.skillTree?.fusionMoves.map(({ id, evidence }) => ({ id, evidence })) ?? [],
    },
  };
}

export async function updateSquad(path, slot, agentmon, role, statePath, rootDir) {
  const squad = await readJson(path, { format: "agentmon.squad/v1", updatedAt: null, members: [] });
  const member = {
    slot,
    id: agentmon.id,
    species: agentmon.species,
    form: agentmon.form ?? agentmon.species,
    generation: agentmon.lineage?.generation ?? 1,
    agentName: agentmon.trainerName,
    role,
    promptprint: agentmon.promptprint.signature,
    confidence: growthProfile(agentmon).confidence,
    skills: agentmon.learnedSkills.length,
    loops: agentmon.loops.length,
    updatedAt: agentmon.trainedAt,
    state: statePath.startsWith(rootDir) ? statePath.slice(rootDir.length + 1) : statePath,
  };
  squad.members = [...(squad.members || []).filter((item) => item.slot !== slot), member]
    .sort((left, right) => left.slot.localeCompare(right.slot));
  squad.updatedAt = new Date().toISOString();
  await writeJson(path, squad);
  return squad;
}

export async function processFeed(feed, options = {}) {
  validateFeed(feed);
  const rootDir = resolve(options.rootDir || process.cwd());
  const slot = safeSlot(options.slot);
  const paths = pathsFor(rootDir, slot);
  const previous = await readAgentmonState(rootDir, slot);
  if (previous?.ownership?.status === "pending-transfer") throw new Error(`Agentmon ${previous.id} is frozen while transfer ${previous.ownership.pendingTransfer?.certificateId || "unknown"} is pending.`);
  const existingConfig = await readJson(paths.config);
  const calibration = await readJson(paths.calibration, { format: "agentmon.calibration/v1", updatedAt: null, corrections: {} });
  const ledger = await readJson(paths.ledger, { format: "agentmon.learning-ledger/v1", entries: [] });
  const lastEntry = ledger.entries.at(-1);
  if (lastEntry?.revision === feed.revision && lastEntry?.engineVersion === ENGINE_VERSION && lastEntry?.calibrationRevision === calibration.updatedAt && previous) {
    return { changed: false, action: "unchanged", slot, agentmon: previous, paths };
  }

  const firstPersonalArchetype = ledger.entries.find((entry) => entry.engineVersion === "0.2.0")?.learned?.archetype;
  const identity = previous && firstPersonalArchetype
    ? { ...previous, promptprint: { ...previous.promptprint, archetype: firstPersonalArchetype } }
    : previous;
  const { createAgentInput, createSkillsMarkdown, generateAgentmon, generateAgentmonDerivedOnly, trainAgentmon, trainAgentmonDerivedOnly } = await loadEngine();
  const config = configFromOptions(options, existingConfig, identity, createAgentInput);
  const sources = sourcesFromFeed(feed, calibration);
  if (!sources.length) throw new Error("The approved task has no user prompts to train from yet.");
  const agentmon = identity
    ? options.retention === "derived-only" ? trainAgentmonDerivedOnly(identity, config, sources) : trainAgentmon(identity, config, sources)
    : options.retention === "derived-only" ? generateAgentmonDerivedOnly(config, sources) : generateAgentmon(config, sources);
  const previousPromptIds = ledger.entries.flatMap((entry) => entry.change?.addedPromptIds || []);
  const entry = ledgerEntry(feed, previous, agentmon, previousPromptIds, calibration.updatedAt);
  ledger.entries.push(entry);
  ledger.updatedAt = new Date().toISOString();

  await writeJson(paths.config, { ...config, consent: "user_prompts_only" });
  await writeJson(paths.state, agentmon);
  await writeJson(paths.promptprint, {
    format: "agentmon.promptprint/v3",
    agentmonId: agentmon.id,
    derivedFrom: { promptCount: sources.length, rawPromptTextStored: false },
    hatch: agentmon.promptprint,
    growth: growthProfile(agentmon),
    updatedAt: agentmon.trainedAt,
  });
  await atomicWrite(paths.skill, createSkillsMarkdown(agentmon));
  await writeJson(paths.ledger, ledger);
  await updateSquad(paths.squad, slot, agentmon, config.role, paths.state, rootDir);
  await persistAgentmonSnapshot(rootDir, {
    slot,
    agentmon,
    role: config.role,
    eventType: previous ? "training" : "hatch",
    occurredAt: agentmon.trainedAt,
    eventPayload: entry,
    idempotencyKey: `${previous ? "training" : "hatch"}:${agentmon.id}:${ENGINE_VERSION}:${feed.revision}:${calibration.updatedAt || "uncalibrated"}`,
  });
  return { changed: true, action: previous ? "trained" : "hatched", slot, agentmon, paths, entry };
}

export function formatCard(result) {
  const agentmon = result.agentmon;
  const skills = agentmon.learnedSkills.slice(0, 4).map((skill) => skill.name).join(", ") || "observing";
  const line = (value) => `| ${String(value).slice(0, 48).padEnd(48, " ")} |`;
  return [
    "+--------------------------------------------------+",
    line(`AGENTMON ${agentmon.number}  ${(agentmon.form ?? agentmon.species).toUpperCase()}`),
    line(`${agentmon.trainerName} · ${agentmon.primaryType}/${agentmon.secondaryType}`),
    line(`Promptprint ${agentmon.promptprint.signature} · ${growthProfile(agentmon).confidence}%`),
    line(`${agentmon.promptprint.archetype} · GEN ${agentmon.lineage?.generation ?? 1} · ${agentmon.sourceCount} prompts`),
    line(`Skills: ${skills}`),
    line(`V3 readiness: ${agentmon.hatchReadiness?.score ?? "legacy"}/100 · ${agentmon.arenaReport?.provenProcedures ?? 0} arena-proven`),
    "+--------------------------------------------------+",
  ].join("\n");
}
