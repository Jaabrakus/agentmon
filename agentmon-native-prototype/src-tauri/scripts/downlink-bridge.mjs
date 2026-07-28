import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [command, rootDir, engineRoot = rootDir] = process.argv.slice(2);
if (!rootDir || !new Set(["identity", "compile"]).has(command)) {
  process.stderr.write("Invalid Agentmon bridge request.\n");
  process.exit(2);
}

function visualLifecycle(state) {
  if (!state) return { stage: "signal", score: 0, brightness: 8, label: "UNBOUND SIGNAL", speciesBound: false, hatched: false };
  const score = state.hatchReadiness ? Math.max(0, Math.min(100, Math.round(Number(state.hatchReadiness.score) || 0))) : 100;
  if (score < 60) return { stage: "signal", score, brightness: Math.max(8, score), label: "UNBOUND SIGNAL", speciesBound: false, hatched: false };
  if (score < 100) return { stage: "egg", score, brightness: 100, label: "BOUND EGG", speciesBound: true, hatched: false };
  return { stage: "hatched", score, brightness: 100, label: state.form ?? state.species ?? "AGENTMON", speciesBound: true, hatched: true };
}

async function readAgentmonStatus(root, state) {
  const lifecycle = visualLifecycle(state);
  let species = null;
  let evolution = null;
  if (lifecycle.speciesBound) {
    try {
      const plan = JSON.parse(await readFile(resolve(root, ".agentmon/roster/main/visual/curated-plan.json"), "utf8"));
      species = plan.species;
      evolution = plan.evolution ?? { stage: "form-02", order: 2, label: "Form II", permanent: true, migratedFromLegacyPlan: true };
    } catch {}
  }
  return {
    id: state.id,
    name: lifecycle.hatched ? (state.form ?? state.species) : lifecycle.label,
    readiness: lifecycle.score,
    stage: lifecycle.stage,
    brightness: lifecycle.brightness,
    species,
    evolution,
  };
}

function emitJson(payload) {
  process.stdout.write(JSON.stringify(payload), () => process.exit(0));
}

const PATTERN_META = {
  structure: { label: "Structure", behavior: "Plan and format before acting" },
  precision: { label: "Precision", behavior: "Define exact constraints and outputs" },
  exploration: { label: "Exploration", behavior: "Open alternatives and new paths" },
  iteration: { label: "Iteration", behavior: "Refine repeatedly through feedback" },
  verification: { label: "Verification", behavior: "Check claims, tests, and evidence" },
  delegation: { label: "Delegation", behavior: "Split work across agents or roles" },
  toolfulness: { label: "Toolfulness", behavior: "Use available tools and integrations" },
  empathy: { label: "Human sense", behavior: "Shape work around the audience" },
};

const RESONANCE_PROFILES = {
  mirror: { purpose: "Reflect the trainer's proven sequence.", executionMode: "suggest-only", addsCheckpoint: false },
  counterpart: { purpose: "Catch missing checks before consequential actions.", executionMode: "suggest-only", addsCheckpoint: true },
  mentor: { purpose: "Compare the observed sequence with a higher-value alternative.", executionMode: "suggest-only", addsCheckpoint: true },
  specialist: { purpose: "Apply one site-scoped workflow precisely.", executionMode: "review-only", addsCheckpoint: false },
  operator: { purpose: "Execute approved, proven, low-risk steps.", executionMode: "approved-low-risk", addsCheckpoint: true },
  guardian: { purpose: "Review risk, permissions, and recovery without executing.", executionMode: "review-only", addsCheckpoint: true },
};

function safeIdentityText(value, max = 240) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function deterministicResonance(state) {
  const archetype = String(state?.promptprint?.archetype || "").toLowerCase();
  const named = Object.keys(RESONANCE_PROFILES).find((mode) => archetype.includes(mode));
  if (named) return named;
  const dna = state?.lineage?.genesisDNA || state?.dna || state?.id || "unbound";
  const digest = createHash("sha256").update(String(dna)).digest("hex");
  return Object.keys(RESONANCE_PROFILES)[Number.parseInt(digest.slice(0, 8), 16) % Object.keys(RESONANCE_PROFILES).length];
}

function compileAgentmonIdentity(state) {
  const hatchProfile = state.promptprint || {};
  const profile = state.growthPromptprint || hatchProfile;
  const confidence = Number(profile.confidence) || 0;
  const sampleCount = Number(profile.sampleCount) || 0;
  const patterns = confidence >= 70 && sampleCount >= 5
    ? Object.entries(profile.dimensions || {})
      .filter(([key, score]) => PATTERN_META[key] && Number(score) >= 32)
      .sort((left, right) => Number(right[1]) - Number(left[1]) || left[0].localeCompare(right[0]))
      .slice(0, 6)
      .map(([key, score]) => ({ key, label: PATTERN_META[key].label, behavior: PATTERN_META[key].behavior, score: Number(score) }))
    : [];
  const learnedById = new Map((state.learnedSkills || []).map((skill) => [skill.id, skill]));
  const capabilities = (state.skillCandidates || [])
    .filter((candidate) => ["validated", "learned"].includes(candidate.stage) && Number(candidate.confidence) >= 70 && Number(candidate.behavioralEvidenceCount) >= 3)
    .sort((left, right) => Number(right.confidence) - Number(left.confidence) || left.id.localeCompare(right.id))
    .slice(0, 6)
    .map((candidate) => {
      const learned = learnedById.get(candidate.id) || {};
      return {
        id: safeIdentityText(candidate.id, 80),
        name: safeIdentityText(candidate.name || learned.name || candidate.id, 100),
        description: safeIdentityText(learned.description || candidate.reason || "Evidence-backed capability tendency."),
        stage: candidate.stage,
        confidence: Number(candidate.confidence) || 0,
        behavioralEvidenceCount: Number(candidate.behavioralEvidenceCount) || 0,
      };
    });
  const mode = deterministicResonance(state);
  const identity = {
    format: "agentmon.identity-context/v1",
    name: safeIdentityText(state.form || state.species || "Agentmon", 100),
    species: safeIdentityText(state.species || "unbound", 100),
    nature: safeIdentityText(state.nature || "unknown", 80),
    permanentArchetype: safeIdentityText(hatchProfile.archetype || "unknown", 120),
    hatchConfidence: Number(hatchProfile.confidence) || 0,
    generation: Math.max(1, Number(state.lineage?.generation) || 1),
    resonance: { mode, ...RESONANCE_PROFILES[mode] },
    workingProfile: { confidence, sampleCount, status: patterns.length ? "trusted-derived" : "developing", patterns },
    capabilities,
    boundaries: { cloneClaimAllowed: false, hiddenReasoningClaimAllowed: false, capabilityMeansToolAccess: false, developingProceduresExecutable: false },
  };
  return { ...identity, digest: createHash("sha256").update(JSON.stringify(identity)).digest("hex") };
}

function renderIdentityLines(identity) {
  const lines = [
    "IDENTITY LENS (derived working context, not a clone or hidden reasoning):",
    `- Permanent archetype: ${identity.permanentArchetype} · nature ${identity.nature} · generation ${identity.generation}`,
    `- Resonance: ${identity.resonance.mode} — ${identity.resonance.purpose} (${identity.resonance.executionMode})`,
  ];
  if (identity.workingProfile.patterns.length) {
    lines.push(`- Trusted working patterns (${identity.workingProfile.confidence}% confidence, ${identity.workingProfile.sampleCount} samples):`);
    for (const pattern of identity.workingProfile.patterns) lines.push(`  - ${pattern.label} ${pattern.score}/96: ${pattern.behavior}`);
  } else {
    lines.push("- Working patterns are still developing; do not use them as instructions.");
  }
  if (identity.capabilities.length) {
    lines.push("- Evidence-backed capability tendencies (these do not grant tools):");
    for (const capability of identity.capabilities) lines.push(`  - ${capability.name}: ${capability.description} (${capability.stage}, ${capability.confidence}% confidence)`);
  }
  lines.push("Use this lens to choose emphasis, checks, and presentation—not to impersonate the trainer.");
  return lines;
}

async function readStdin() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

try {
  if (command === "compile") {
    const { routeContext } = await import(pathToFileURL(resolve(engineRoot, "plugins/agentmon-codex/lib/runtime/v4-learning-service.mjs")).href);
    const prompt = await readStdin();
    const state = JSON.parse(await readFile(resolve(rootDir, ".agentmon/roster/main/agentmon.json"), "utf8"));
    const [routed, status] = await Promise.all([
      routeContext({
        rootDir,
        agentmons: [{ ...state, slot: "main" }],
        query: prompt,
        allowedPermissions: [],
        advisoryMode: true,
        includeIdentityFallback: true,
        minimumScore: 16,
        allowTesting: false,
        maxAgentmons: 1,
        maxProcedures: 4,
      }),
      readAgentmonStatus(rootDir, state),
    ]);
    if (!routed?.selected) throw new Error("No active Agentmon identity could be compiled.");
    emitJson({
      format: "agentmon.downlink/v3",
      slot: "main",
      agentmon: { id: state.id, name: status.name, species: status.species, evolution: status.evolution },
      procedures: routed.selected.procedures,
      identity: routed.selected.identity,
      packet: routed.packet,
      queryDigest: routed.queryDigest,
      routing: routed.routing,
      delivery: { status: "compiled-not-sent", modelConnected: false },
      privacy: {
        rawPromptsIncluded: false,
        rawPromptsStored: false,
        derivedIdentityIncluded: true,
        provenProceduresOnly: true,
        toolPermissionsGrantedByAgentmon: false,
        storedByAgentmonCloud: false,
        sentToActiveModelProvider: false,
      },
    });
  } else {
    const [skillMarkdown, targets, state] = await Promise.all([
      readFile(resolve(rootDir, ".agentmon/roster/main/SKILL.md"), "utf8"),
      readFile(resolve(rootDir, ".agentmon/model-targets.json"), "utf8").then(JSON.parse).catch(() => ({ targets: [] })),
      readFile(resolve(rootDir, ".agentmon/roster/main/agentmon.json"), "utf8").then(JSON.parse),
    ]);
    const status = await readAgentmonStatus(rootDir, state);
    const identity = compileAgentmonIdentity(state);
    const arenaByProcedureId = new Map((state.arenaReport?.results || []).map((result) => [result.procedureId, result]));
    const { executableProcedures } = await import(pathToFileURL(resolve(engineRoot, "plugins/agentmon-codex/lib/agentmon-engine.mjs")).href);
    const provenProcedures = executableProcedures(state)
      .slice(0, 4)
      .map((procedure) => ({ ...procedure, executionMode: "advisory-only", arenaStatus: "proven" }));
    const downlink = {
      format: "agentmon.downlink/v3",
      slot: "main",
      agentmon: { id: state.id, name: status.name, species: status.species, evolution: status.evolution },
      procedures: provenProcedures,
      identity,
      packet: renderIdentityLines(identity).join("\n"),
      privacy: {
        rawPromptsIncluded: false,
        derivedIdentityIncluded: true,
        provenProceduresOnly: true,
        toolPermissionsGrantedByAgentmon: false,
        storedByAgentmonCloud: false,
        sentToActiveModelProvider: false,
      },
    };
    const configuredTarget = (targets.targets || []).find((target) => target.enabled) || null;
    const arenaResults = state.arenaReport?.results || [];
    const procedureRows = (state.proceduralSkills || []).map((procedure) => ({
      id: procedure.id,
      name: procedure.name,
      stage: procedure.stage,
      confidence: procedure.confidence,
      trainerReview: procedure.trainerReview,
      arenaStatus: arenaResults.find((result) => result.procedureId === procedure.id)?.status || "untested",
    }));
    const activeEffectiveness = (state.effectivenessReport?.procedures || []).filter((procedure) => procedure.activations > 0);
    emitJson({
      ...downlink,
      delivery: { status: "identity-loaded-locally", modelConnected: false },
      privacy: {
        ...downlink.privacy,
        sentToActiveModelProvider: false,
      },
      skillMarkdown,
      source: {
        projectRoot: rootDir,
        skillPath: resolve(rootDir, ".agentmon/roster/main/SKILL.md"),
        statePath: resolve(rootDir, ".agentmon/roster/main/agentmon.json"),
      },
      summary: {
        format: "agentmon.desktop-summary/v1",
        id: state.id,
        creationVersion: state.creationVersion,
        identity: {
          name: downlink.identity.name,
          species: downlink.agentmon.species?.name || state.species,
          form: downlink.agentmon.evolution?.label || state.form || state.species,
          archetype: downlink.identity.permanentArchetype,
          nature: downlink.identity.nature,
          resonance: downlink.identity.resonance,
          hatchConfidence: downlink.identity.hatchConfidence,
        },
        hatch: state.hatchReadiness,
        lineage: state.lineage,
        promptprint: {
          hatch: state.promptprint,
          growth: state.growthPromptprint,
        },
        capabilities: (state.learnedSkills || []).map(({ id, name, type, power, description, evidence, source }) => ({ id, name, type, power, description, evidence, source })),
        procedures: procedureRows,
        arena: {
          tested: state.arenaReport?.testedProcedures || 0,
          proven: state.arenaReport?.provenProcedures || 0,
          results: arenaResults.filter((result) => result.status !== "untested"),
        },
        effectiveness: {
          averageScore: state.effectivenessReport?.averageScore || 0,
          totalOutcomes: state.effectivenessReport?.totalOutcomes || 0,
          beneficialProcedures: state.effectivenessReport?.beneficialProcedures || 0,
          regressedProcedures: state.effectivenessReport?.regressedProcedures || 0,
          modelCoverage: state.effectivenessReport?.modelCoverage || [],
          activeProcedures: activeEffectiveness,
          lastOutcomeAt: state.effectivenessReport?.lastOutcomeAt || null,
        },
        ownership: state.ownership || null,
        privacy: {
          rawPromptsIncluded: false,
          rawResponsesIncluded: false,
          derivedOnly: true,
        },
      },
      modelTarget: configuredTarget ? {
        id: configuredTarget.id,
        adapter: configuredTarget.adapter,
        provider: configuredTarget.provider,
        model: configuredTarget.model,
        configured: true,
        connected: false,
      } : null,
    });
  }
} catch (error) {
  process.stderr.write(`${error?.message || error}\n`, () => process.exit(1));
}
