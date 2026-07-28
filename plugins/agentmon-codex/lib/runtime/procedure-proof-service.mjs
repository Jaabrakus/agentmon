import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { persistAgentmonSnapshot } from "../../scripts/agentmon-db.mjs";
import { addHeldoutTask, createProofExperiment, proofDigest, proofReadiness } from "../proof-protocol.mjs";
import { ENGINE_VERSION, FORMAT, VALID_INTENTS, VALID_OUTCOMES, VALID_QUALITIES, VALID_REVIEWS, VALID_VARIANTS, atomicWrite, loadEngine, pathsFor, readAgentmonState, readJson, safeSlot, validateFeed, writeJson } from "./storage.mjs";
import { processFeed, updateSquad } from "./training-service.mjs";

export async function persistDerivedMutation(rootDir, slot, agentmon, eventType, eventPayload) {
  const paths = pathsFor(rootDir, slot);
  const config = await readJson(paths.config, { role: "builder" });
  const ledger = await readJson(paths.ledger, { format: "agentmon.learning-ledger/v1", entries: [] });
  const { createSkillsMarkdown } = await loadEngine();
  const entry = { engineVersion: ENGINE_VERSION, event: eventType, observedAt: agentmon.trainedAt, source: { rawPromptTextStored: false }, ...eventPayload };
  ledger.entries.push(entry);
  ledger.updatedAt = agentmon.trainedAt;
  await writeJson(paths.state, agentmon);
  await atomicWrite(paths.skill, createSkillsMarkdown(agentmon));
  await writeJson(paths.ledger, ledger);
  await updateSquad(paths.squad, slot, agentmon, config.role || "builder", paths.state, rootDir);
  await persistAgentmonSnapshot(rootDir, {
    slot,
    agentmon,
    role: config.role || "builder",
    eventType,
    occurredAt: agentmon.trainedAt,
    eventPayload: entry,
    idempotencyKey: `${eventType}:${agentmon.id}:${agentmon.trainedAt}`,
  });
  return { changed: true, action: eventType, slot, agentmon, paths, entry };
}

export async function correctIntent(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const slot = safeSlot(options.slot);
  if (!VALID_INTENTS.has(options.intent)) throw new Error(`Unknown intent: ${options.intent}.`);
  const paths = pathsFor(rootDir, slot);
  const suppliedFeed = options.feed?.format === FORMAT ? options.feed : null;
  const feedPath = suppliedFeed ? null : options.feed || (await readJson(paths.feed) ? paths.feed : resolve(rootDir, ".agentmon/codex-feed.json"));
  const feed = suppliedFeed || await readJson(feedPath);
  if (!feed) throw new Error(`No feed found at ${feedPath}.`);
  validateFeed(feed);
  const source = options.source === "latest"
    ? feed.prompts.at(-1)
    : feed.prompts.find((prompt, index) => String(prompt.id || `prompt-${index + 1}`) === String(options.source));
  if (!source) throw new Error(`Prompt source not found: ${options.source || "missing"}.`);
  const sourceId = String(source.id || `prompt-${feed.prompts.indexOf(source) + 1}`);
  const calibration = await readJson(paths.calibration, { format: "agentmon.calibration/v1", updatedAt: null, corrections: {} });
  const correctedAt = new Date().toISOString();
  calibration.corrections[sourceId] = { intent: options.intent, correctedAt };
  calibration.updatedAt = correctedAt;
  await writeJson(paths.calibration, calibration);
  const result = await processFeed(feed, { ...options, rootDir, slot, feed: feedPath || undefined });
  return { ...result, correctedSourceId: sourceId, correctedIntent: options.intent, calibration: paths.calibration };
}

export async function correctIntentCommand(args) {
  if (!args.source || !args.intent) throw new Error("correct-intent requires --source latest|ID and --intent INTENT.");
  const result = await correctIntent(args);
  process.stdout.write(`Intent corrected: ${result.correctedSourceId} → ${result.correctedIntent}\nAgentmon retrained from the same feed using trainer evidence.\nCalibration: ${result.calibration}\n`);
}

export async function proposeProcedure(options = {}) {
  throw new Error("Trainer-authored procedures are disabled for canonical Agentmons. Procedures must be learned from behavior by the creation engine; fork a modded lineage for custom instructions.");
}

export async function proposeProcedureCommand(args) {
  const result = await proposeProcedure(args);
  const procedure = result.agentmon.proceduralSkills.find((item) => item.id === result.entry.procedure.id);
  process.stdout.write(`Procedure proposed: ${procedure.name} [${procedure.id}]\nStage: ${procedure.stage} · evidence ${procedure.behavioralEvidenceCount} behavioral observations · trainer unreviewed\nReview its raw-free structure with \`creation\`, then explicitly confirm or reject it.\n`);
}

export async function reviewProcedure(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const slot = safeSlot(options.slot);
  if (!options.procedure || !VALID_REVIEWS.has(options.review)) throw new Error("review-procedure requires --procedure ID and --review confirmed|rejected.");
  const state = await readAgentmonState(rootDir, slot);
  if (!state) throw new Error(`No Agentmon in slot '${slot}'.`);
  const { reviewAgentmonProcedure } = await loadEngine();
  const agentmon = reviewAgentmonProcedure(state, options.procedure, options.review);
  return await persistDerivedMutation(rootDir, slot, agentmon, "procedure-review", { procedure: { id: options.procedure, review: options.review } });
}

export async function reviewProcedureCommand(args) {
  const result = await reviewProcedure(args);
  process.stdout.write(`Procedure ${args.procedure}: trainer ${args.review}.\nSKILL.md and local database updated.\n${result.paths.skill}\n`);
}

function proofDirectory(rootDir, proofId) {
  return resolve(rootDir, ".agentmon/proofs", proofId);
}

async function currentProofId(rootDir, explicitId) {
  if (explicitId) return explicitId;
  const current = await readJson(resolve(rootDir, ".agentmon/proofs/current.json"));
  if (!current?.id) throw new Error("No current proof experiment. Run proof-start first.");
  return current.id;
}

async function readProofFiles(rootDir, explicitId) {
  const id = await currentProofId(rootDir, explicitId);
  const directory = proofDirectory(rootDir, id);
  const experiment = await readJson(resolve(directory, "manifest.json"));
  const privateData = await readJson(resolve(directory, "private-tasks.json"), { format: "agentmon.private-heldout-tasks/v1", tasks: [] });
  if (!experiment) throw new Error(`Unknown proof experiment: ${id}.`);
  return { id, directory, experiment, privateData };
}

async function developmentArenaPrompts(rootDir) {
  const directory = resolve(rootDir, "plugins/agentmon-codex/arena");
  const names = await readdir(directory).catch(() => []);
  const suites = await Promise.all(names.filter((name) => name.endsWith(".json")).map((name) => readJson(resolve(directory, name))));
  return suites.flatMap((suite) => suite?.tasks?.map((task) => task.prompt).filter(Boolean) || []);
}

export async function startProofExperiment(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const slot = safeSlot(options.slot);
  if (!options.procedure) throw new Error("proof-start requires --procedure ID.");
  const active = await readJson(resolve(rootDir, ".agentmon/proofs/current.json"));
  if (active?.id) {
    const activeManifest = await readJson(resolve(proofDirectory(rootDir, active.id), "manifest.json"));
    if (["collecting", "ready"].includes(activeManifest?.status)) throw new Error(`Proof ${active.id} is already ${activeManifest.status}; do not reset its cutoff.`);
  }
  const state = await readAgentmonState(rootDir, slot);
  if (!state) throw new Error(`No Agentmon in slot '${slot}'.`);
  const feedPath = options.feed || pathsFor(rootDir, slot).feed;
  const feed = await readJson(feedPath);
  if (!feed) throw new Error(`No approved feed found at ${feedPath}.`);
  const experiment = createProofExperiment({
    agentmon: state,
    procedureId: options.procedure,
    feed,
    targetTasks: options.target,
    minimumTasks: options.minimum,
    repositoryDigest: sha256({ agentmonId: state.id, dna: state.dna, trainedAt: state.trainedAt, feedRevision: feed.revision }),
  });
  const directory = proofDirectory(rootDir, experiment.id);
  await writeJson(resolve(directory, "manifest.json"), experiment);
  await writeJson(resolve(directory, "private-tasks.json"), { format: "agentmon.private-heldout-tasks/v1", tasks: [] });
  await writeJson(resolve(directory, "TASK_TEMPLATE.json"), {
    format: "agentmon.heldout-task/v1",
    id: "replace-with-stable-task-id",
    createdAt: new Date().toISOString(),
    source: "Describe the naturally occurring task source without private content.",
    prompt: "Replace with a new post-cutoff task. Do not mention Agentmon or the procedure.",
    eligibility: { naturallyOccurring: true, independentRubric: true, readOnly: true, multiplePlausibleActions: true, consentedForEvaluation: true },
    rubric: { passThreshold: 78, criteria: ["Accurate use of available evidence", "Bounded and decision-relevant recommendation", "Clear risks, verification, and uncertainty"] },
  });
  await writeJson(resolve(rootDir, ".agentmon/proofs/current.json"), { id: experiment.id, updatedAt: experiment.updatedAt });
  return { experiment, directory, feedPath };
}

export async function startProofCommand(args) {
  const result = await startProofExperiment(args);
  const readiness = proofReadiness(result.experiment);
  process.stdout.write(`Personalization proof started: ${readiness.id}\nProcedure: ${readiness.procedureId} · trainer confirmed\nCutoff: ${readiness.cutoff}\nHeld-out tasks: ${readiness.collected}/${readiness.target} · minimum ${readiness.minimum}\nPrivate local directory: ${result.directory}\nRaw prompts copied into manifest or database: no\n`);
}

export async function enrollProofTask(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const slot = safeSlot(options.slot);
  if (!options.file) throw new Error("proof-add requires --file HELDOUT_TASK.json.");
  const { id, directory, experiment, privateData } = await readProofFiles(rootDir, options.proof);
  const state = await readAgentmonState(rootDir, slot);
  if (!state) throw new Error(`No Agentmon in slot '${slot}'.`);
  const currentProcedure = state.proceduralSkills?.find((item) => item.id === experiment.procedure.id);
  if (!currentProcedure || proofDigest(currentProcedure) !== experiment.procedure.digest) {
    throw new Error("The frozen procedure changed after proof-start. Start a new experiment rather than contaminating this one.");
  }
  const feed = await readJson(pathsFor(rootDir, slot).feed);
  const task = await readJson(options.file);
  if (!task) throw new Error(`Held-out task file not found: ${options.file}.`);
  const result = addHeldoutTask(experiment, task, {
    trainingPrompts: feed?.prompts
      ?.filter((prompt) => !prompt.capturedAt || Date.parse(prompt.capturedAt) <= Date.parse(experiment.trainingCutoff.capturedAt))
      .map((prompt) => prompt.text) || [],
    developmentPrompts: await developmentArenaPrompts(rootDir),
    existingPrompts: privateData.tasks.map((item) => item.prompt),
  });
  privateData.tasks.push(result.privateTask);
  await writeJson(resolve(directory, "manifest.json"), result.experiment);
  await writeJson(resolve(directory, "private-tasks.json"), privateData);
  await writeJson(resolve(rootDir, ".agentmon/proofs/current.json"), { id, updatedAt: result.experiment.updatedAt });
  return { experiment: result.experiment, metadata: result.experiment.tasks.at(-1), directory };
}

export async function enrollProofTaskCommand(args) {
  const result = await enrollProofTask(args);
  const readiness = proofReadiness(result.experiment);
  process.stdout.write(`Held-out task enrolled: ${result.metadata.id}\nLeakage check: passed · maximum observed similarity ${result.metadata.maximumObservedSimilarity}\nProgress: ${readiness.collected}/${readiness.target} · ${readiness.remaining} remaining · status ${readiness.status}\nRaw task text remains local: ${result.directory}\n`);
}

export async function getProofStatus(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const { experiment, directory } = await readProofFiles(rootDir, options.proof);
  return { experiment, readiness: proofReadiness(experiment), directory };
}

export async function showProofStatus(args) {
  const result = await getProofStatus(args);
  const status = result.readiness;
  process.stdout.write(`Proof ${status.id}: ${status.status}\nProcedure: ${status.procedureId}\nFrozen cutoff: ${status.cutoff}\nHeld-out tasks: ${status.collected}/${status.target} · minimum ${status.minimum}\nRunnable minimum reached: ${status.runnable ? "yes" : "no"}\nFull target reached: ${status.fullTargetReached ? "yes" : "no"}\nPrivate local directory: ${result.directory}\n`);
}

export async function recordArenaTrial(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const slot = safeSlot(options.slot);
  const outcome = options.outcome || "unknown";
  if (!options.procedure || !VALID_VARIANTS.has(options.variant) || !VALID_QUALITIES.has(options.quality) || !VALID_OUTCOMES.has(outcome)) {
    throw new Error("arena-record requires --procedure ID --variant baseline|agentmon --quality pass|fail and an optional valid --outcome.");
  }
  const state = await readAgentmonState(rootDir, slot);
  if (!state) throw new Error(`No Agentmon in slot '${slot}'.`);
  const { recordAgentmonArenaTrial } = await loadEngine();
  const agentmon = recordAgentmonArenaTrial(state, { procedureId: options.procedure, variant: options.variant, decisionQuality: options.quality, outcome });
  return await persistDerivedMutation(rootDir, slot, agentmon, "arena-trial", { trial: agentmon.procedureTrials.at(-1), decisionQualityIndependentOfOutcome: true });
}

export async function recordArenaTrialCommand(args) {
  const result = await recordArenaTrial(args);
  const arena = result.agentmon.arenaReport.results.find((item) => item.procedureId === args.procedure);
  process.stdout.write(`Arena trial recorded: ${args.variant} · decision ${args.quality} · outcome ${args.outcome || "unknown"}.\nStatus: ${arena.status} · lift ${arena.lift >= 0 ? "+" : ""}${arena.lift} points.\n`);
}

export async function showArena(args) {
  const state = await readAgentmonState(args.rootDir, args.slot);
  if (!state) throw new Error(`No Agentmon in slot '${args.slot}'.`);
  const procedures = new Map((state.proceduralSkills || []).map((procedure) => [procedure.id, procedure.name]));
  process.stdout.write(`${state.form ?? state.species} procedure arena\n`);
  for (const result of state.arenaReport?.results || []) {
    process.stdout.write(`- ${procedures.get(result.procedureId) || result.procedureId}: baseline ${result.baseline.passes}/${result.baseline.trials} (${result.baseline.passRate}%) · Agentmon ${result.agentmon.passes}/${result.agentmon.trials} (${result.agentmon.passRate}%) · lift ${result.lift >= 0 ? "+" : ""}${result.lift} · ${result.status}\n`);
  }
  process.stdout.write("Decision quality is graded from information available at decision time. Later outcomes are recorded separately and never determine the grade.\n");
}
