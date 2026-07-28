import { createHash, randomUUID } from "node:crypto";

export const PROOF_FORMAT = "agentmon.personalization-proof/v1";
export const HELDOUT_TASK_FORMAT = "agentmon.heldout-task/v1";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

export function proofDigest(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function portableId(value, label) {
  const id = String(value || "").trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(id)) throw new Error(`${label} must be a portable 1-80 character identifier.`);
  return id;
}

export function normalizeProofText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenSimilarity(left, right) {
  const leftTokens = new Set(normalizeProofText(left).split(" ").filter((token) => token.length > 2));
  const rightTokens = new Set(normalizeProofText(right).split(" ").filter((token) => token.length > 2));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / (leftTokens.size + rightTokens.size - intersection);
}

function requireIsoDate(value, label) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) throw new Error(`${label} must be an ISO timestamp.`);
  return new Date(timestamp).toISOString();
}

function procedureSnapshot(agentmon, procedureId) {
  const procedure = agentmon?.proceduralSkills?.find((item) => item.id === procedureId);
  if (!procedure) throw new Error(`Unknown procedure: ${procedureId}.`);
  if (procedure.trainerReview !== "confirmed") throw new Error("A personalization proof requires a trainer-confirmed procedure.");
  return {
    id: procedure.id,
    name: procedure.name,
    digest: proofDigest(procedure),
    trainerReview: procedure.trainerReview,
    provenance: procedure.provenance || null,
  };
}

export function createProofExperiment(options) {
  const createdAt = requireIsoDate(options.now || new Date().toISOString(), "Proof start time");
  const targetTasks = Math.max(5, Math.min(50, Number(options.targetTasks) || 12));
  const minimumTasks = Math.min(targetTasks, Math.max(5, Number(options.minimumTasks) || 10));
  const feed = options.feed;
  if (feed?.format !== "agentmon.feed/v1" || feed.consent?.scope !== "user_prompts_only" || !Array.isArray(feed.prompts)) {
    throw new Error("A consented Agentmon feed is required to freeze the training cutoff.");
  }
  const genericControl = options.genericControl || {
    id: "matched-generic-product-engineering",
    version: 1,
    instructions: "Clarify the objective, inspect relevant evidence, identify the key uncertainty, recommend one bounded next action, define risks and tests, respect privacy and permissions, and report uncertainty.",
  };
  portableId(genericControl.id, "Generic control id");
  const proofId = options.id || `proof-${createdAt.slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8)}`;
  portableId(proofId, "Proof id");
  const experiment = {
    format: PROOF_FORMAT,
    id: proofId,
    status: "collecting",
    agentmonId: options.agentmon.id,
    procedure: procedureSnapshot(options.agentmon, options.procedureId),
    genericControl: { ...genericControl, digest: proofDigest(genericControl) },
    trainingCutoff: {
      capturedAt: createdAt,
      feedRevision: String(feed.revision || "unknown"),
      promptCount: feed.prompts.length,
      promptDigestSet: proofDigest(feed.prompts.map((prompt) => proofDigest(normalizeProofText(prompt.text))).sort()),
      rawPromptTextStored: false,
    },
    repository: { digest: String(options.repositoryDigest || "unrecorded") },
    protocol: {
      targetTasks,
      minimumTasks,
      prospectiveOnly: true,
      oneGenerationPerArm: true,
      arms: ["baseline", "generic", "agentmon"],
      privateTasksOutsideInspectedWorkspace: true,
      freezeProcedureDuringCollection: true,
      thresholds: {
        meanLiftVsGeneric: 8,
        meanLiftVsBaseline: 10,
        confidenceLowerBoundAboveZero: true,
        noWorseFactualErrorRate: true,
        safetyViolationsAllowed: 0,
      },
    },
    tasks: [],
    createdAt,
    updatedAt: createdAt,
    privacy: { manifestContainsRawPrompts: false, privateTaskFileLocalOnly: true, databaseReceivesRawPrompts: false },
  };
  return experiment;
}

export function addHeldoutTask(experiment, task, context = {}) {
  if (experiment?.format !== PROOF_FORMAT || experiment.status !== "collecting") throw new Error("The proof experiment is not collecting tasks.");
  if (task?.format !== HELDOUT_TASK_FORMAT) throw new Error(`Expected ${HELDOUT_TASK_FORMAT}.`);
  const id = portableId(task.id, "Held-out task id");
  if (experiment.tasks.some((item) => item.id === id)) throw new Error(`Duplicate held-out task id: ${id}.`);
  const prompt = String(task.prompt || "").trim();
  if (!prompt || prompt.length > 100_000) throw new Error("Held-out task prompt must contain 1-100,000 characters.");
  const createdAt = requireIsoDate(task.createdAt, "Held-out task creation time");
  if (Date.parse(createdAt) <= Date.parse(experiment.trainingCutoff.capturedAt)) throw new Error("Held-out tasks must be created after the frozen training cutoff.");
  if (Date.parse(createdAt) > Date.now() + 60_000) throw new Error("Held-out task creation time cannot be in the future.");
  const confirmations = task.eligibility || {};
  const requiredConfirmations = ["naturallyOccurring", "independentRubric", "readOnly", "multiplePlausibleActions", "consentedForEvaluation"];
  const missing = requiredConfirmations.filter((key) => confirmations[key] !== true);
  if (missing.length) throw new Error(`Held-out task is missing eligibility confirmations: ${missing.join(", ")}.`);
  if (/\b(agentmon|core proof loop|personalization proof|trainer[- ]specific)\b/i.test(prompt)) {
    throw new Error("Held-out task reveals the treatment or personalization claim.");
  }
  const criteria = task.rubric?.criteria;
  if (!Array.isArray(criteria) || criteria.length < 3 || criteria.length > 20 || criteria.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error("Held-out task rubric requires 3-20 non-empty criteria written before generation.");
  }
  const passThreshold = Number(task.rubric?.passThreshold ?? 78);
  if (!Number.isFinite(passThreshold) || passThreshold < 0 || passThreshold > 100) throw new Error("Held-out task pass threshold must be 0-100.");
  const comparisonTexts = [...(context.trainingPrompts || []), ...(context.developmentPrompts || []), ...(context.existingPrompts || [])].filter(Boolean);
  const normalized = normalizeProofText(prompt);
  const normalizedDigest = proofDigest(normalized);
  const comparisonDigests = new Set(comparisonTexts.map((value) => proofDigest(normalizeProofText(value))));
  if (comparisonDigests.has(normalizedDigest)) throw new Error("Held-out task exactly matches training or development material.");
  const maximumSimilarity = comparisonTexts.reduce((maximum, value) => Math.max(maximum, tokenSimilarity(prompt, value)), 0);
  if (maximumSimilarity >= 0.8) throw new Error(`Held-out task is too similar to training or development material (${maximumSimilarity.toFixed(2)}).`);
  const sourceDigest = /^[a-f0-9]{64}$/i.test(String(task.sourceDigest || "")) ? String(task.sourceDigest).toLowerCase() : proofDigest(task.source || id);
  const privateTask = {
    id,
    prompt,
    createdAt,
    sourceDigest,
    rubric: { ...task.rubric, passThreshold },
    eligibility: Object.fromEntries(requiredConfirmations.map((key) => [key, true])),
  };
  const metadata = {
    id,
    createdAt,
    sourceDigest,
    promptDigest: normalizedDigest,
    rubricDigest: proofDigest(privateTask.rubric),
    maximumObservedSimilarity: Number(maximumSimilarity.toFixed(3)),
    eligibilityConfirmed: true,
  };
  const updatedAt = requireIsoDate(context.now || new Date().toISOString(), "Task enrollment time");
  const next = { ...experiment, tasks: [...experiment.tasks, metadata], updatedAt };
  if (next.tasks.length >= next.protocol.targetTasks) next.status = "ready";
  return { experiment: next, privateTask };
}

export function proofReadiness(experiment) {
  if (experiment?.format !== PROOF_FORMAT) throw new Error(`Expected ${PROOF_FORMAT}.`);
  const collected = experiment.tasks.length;
  return {
    id: experiment.id,
    status: experiment.status,
    collected,
    target: experiment.protocol.targetTasks,
    minimum: experiment.protocol.minimumTasks,
    remaining: Math.max(0, experiment.protocol.targetTasks - collected),
    runnable: collected >= experiment.protocol.minimumTasks,
    fullTargetReached: collected >= experiment.protocol.targetTasks,
    procedureId: experiment.procedure.id,
    cutoff: experiment.trainingCutoff.capturedAt,
  };
}

export function buildPrivateArenaSuite(experiment, privateTasks) {
  const readiness = proofReadiness(experiment);
  if (!readiness.runnable) throw new Error(`Proof requires at least ${readiness.minimum} held-out tasks; ${readiness.collected} collected.`);
  const byId = new Map(privateTasks.map((task) => [task.id, task]));
  const tasks = experiment.tasks.map((metadata) => {
    const task = byId.get(metadata.id);
    if (!task || proofDigest(normalizeProofText(task.prompt)) !== metadata.promptDigest || proofDigest(task.rubric) !== metadata.rubricDigest) {
      throw new Error(`Private held-out task integrity failed: ${metadata.id}.`);
    }
    return { id: task.id, prompt: task.prompt, rubric: task.rubric };
  });
  return {
    format: "agentmon.arena-suite/v1",
    id: experiment.id,
    version: 1,
    title: "Private prospective Agentmon personalization proof",
    domain: "product-engineering",
    systemPrompt: "Act as a rigorous product engineering lead. Inspect only the provided isolated workspace when useful. Separate implemented facts from inference, make one bounded recommendation, and respect privacy and permissions.",
    genericControl: {
      id: experiment.genericControl.id,
      version: experiment.genericControl.version,
      instructions: experiment.genericControl.instructions,
    },
    tasks,
  };
}
