import { createHash, randomUUID } from "node:crypto";

export const OUTCOME_FORMAT = "agentmon.outcome/v1";
const OUTCOMES = new Set(["success", "failure", "unknown"]);
const RATINGS = new Set(["helped", "neutral", "missed"]);
const CORRECTIONS = new Set(["none", "minor", "major", "replaced"]);
const BLOCKED_KEYS = /^(?:content|prompt|prompts|prompttext|rawprompt|rawprompttext|response|output|assistanttext|reasoning|message|messages)$/i;

export function outcomeDigest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function assertRawFree(value, path = "event") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertRawFree(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (BLOCKED_KEYS.test(key)) throw new Error(`Outcome events may not contain raw text field ${path}.${key}.`);
    assertRawFree(nested, `${path}.${key}`);
  }
}

function boundedInteger(value, minimum, maximum, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(number)));
}

function safeId(value, label, maximum = 128) {
  const id = String(value || "").trim();
  if (!id || id.length > maximum || !/^[a-zA-Z0-9._:-]+$/.test(id)) throw new Error(`${label} is invalid.`);
  return id;
}

export function validateOutcomeEvent(input, agentmon = null) {
  assertRawFree(input);
  if (input?.format && input.format !== OUTCOME_FORMAT) throw new Error(`Expected ${OUTCOME_FORMAT}.`);
  if (!OUTCOMES.has(input?.outcome)) throw new Error("Outcome must be success, failure, or unknown.");
  if (!RATINGS.has(input?.rating)) throw new Error("Rating must be helped, neutral, or missed.");
  if (!CORRECTIONS.has(input?.correctionLevel || "none")) throw new Error("Unknown correction level.");
  const procedureIds = [...new Set((input?.procedureIds || []).map((id) => safeId(id, "Procedure id", 64)))];
  if (!procedureIds.length || procedureIds.length > 8) throw new Error("An outcome requires 1-8 procedure ids.");
  if (agentmon) {
    const known = new Set((agentmon.proceduralSkills || []).map((procedure) => procedure.id));
    const unknown = procedureIds.find((id) => !known.has(id));
    if (unknown) throw new Error(`Outcome references unknown procedure: ${unknown}.`);
  }
  const taskDigest = String(input.taskDigest || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(taskDigest)) throw new Error("Outcome requires a SHA-256 task digest, never raw task text.");
  const recordedAt = input.recordedAt || new Date().toISOString();
  if (!Number.isFinite(Date.parse(recordedAt))) throw new Error("Outcome recordedAt must be an ISO timestamp.");
  return {
    format: OUTCOME_FORMAT,
    id: input.id ? safeId(input.id, "Outcome id") : `outcome-${randomUUID()}`,
    agentmonId: agentmon?.id || safeId(input.agentmonId, "Agentmon id"),
    conversation: input.conversation ? safeId(input.conversation, "Conversation id") : null,
    taskDigest,
    procedureIds,
    outcome: input.outcome,
    rating: input.rating,
    retryCount: boundedInteger(input.retryCount, 0, 20),
    correctionLevel: input.correctionLevel || "none",
    durationMs: input.durationMs == null ? null : boundedInteger(input.durationMs, 0, 86_400_000),
    tokenCount: input.tokenCount == null ? null : boundedInteger(input.tokenCount, 0, 10_000_000),
    provider: input.provider ? safeId(input.provider, "Provider", 64) : null,
    model: input.model ? safeId(input.model, "Model", 128) : null,
    source: "trainer-feedback",
    proofEligible: false,
    rawTextStored: false,
    recordedAt,
  };
}

export function scoreOutcome(event) {
  const outcome = event.outcome === "success" ? 35 : event.outcome === "failure" ? -35 : 0;
  const rating = event.rating === "helped" ? 30 : event.rating === "missed" ? -30 : 0;
  const correction = { none: 0, minor: -5, major: -15, replaced: -25 }[event.correctionLevel] || 0;
  return Math.max(-100, Math.min(100, outcome + rating + correction - Math.min(20, event.retryCount * 4)));
}

function wilsonLowerBound(successes, trials) {
  if (!trials) return 0;
  const z = 1.96;
  const rate = successes / trials;
  const denominator = 1 + z * z / trials;
  const center = rate + z * z / (2 * trials);
  const margin = z * Math.sqrt((rate * (1 - rate) + z * z / (4 * trials)) / trials);
  return Math.max(0, Math.round(((center - margin) / denominator) * 100));
}

export function buildEffectivenessReport(events = [], procedures = []) {
  const ids = new Set(procedures.map((procedure) => procedure.id));
  for (const event of events) event.procedureIds.forEach((id) => ids.add(id));
  const results = [...ids].map((procedureId) => {
    const rows = events.filter((event) => event.procedureIds.includes(procedureId));
    const successes = rows.filter((event) => event.outcome === "success").length;
    const helpful = rows.filter((event) => event.rating === "helped").length;
    const missed = rows.filter((event) => event.rating === "missed").length;
    const averageScore = rows.length ? Math.round(rows.reduce((sum, event) => sum + scoreOutcome(event), 0) / rows.length) : 0;
    const successRate = rows.length ? Math.round(successes / rows.length * 100) : 0;
    const helpfulRate = rows.length ? Math.round(helpful / rows.length * 100) : 0;
    let status = "insufficient";
    if (rows.length >= 5) status = averageScore >= 10 && helpfulRate >= 60 ? "beneficial" : averageScore <= -10 || missed > helpful ? "regressed" : "monitoring";
    return {
      procedureId,
      activations: rows.length,
      successes,
      successRate,
      successLowerBound: wilsonLowerBound(successes, rows.length),
      helpful,
      helpfulRate,
      averageScore,
      retries: rows.reduce((sum, event) => sum + event.retryCount, 0),
      status,
      lastOutcomeAt: rows.at(-1)?.recordedAt || null,
    };
  }).sort((left, right) => right.averageScore - left.averageScore || right.activations - left.activations);
  const measured = results.filter((result) => result.activations > 0);
  return {
    format: "agentmon.effectiveness/v1",
    totalOutcomes: events.length,
    averageScore: events.length ? Math.round(events.reduce((sum, event) => sum + scoreOutcome(event), 0) / events.length) : 0,
    beneficialProcedures: results.filter((result) => result.status === "beneficial").length,
    regressedProcedures: results.filter((result) => result.status === "regressed").length,
    procedures: results,
    modelCoverage: [...new Set(events.filter((event) => event.model).map((event) => `${event.provider || "unknown"}:${event.model}`))].sort(),
    lastOutcomeAt: measured.map((result) => result.lastOutcomeAt).filter(Boolean).sort().at(-1) || null,
    privacy: { rawPromptsIncluded: false, rawResponsesIncluded: false, proofEligible: false },
  };
}

export function recordOutcome(agentmon, input) {
  const event = validateOutcomeEvent(input, agentmon);
  const outcomeEvents = [...(agentmon.outcomeEvents || []).filter((existing) => existing.id !== event.id), event]
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  const effectivenessReport = buildEffectivenessReport(outcomeEvents, agentmon.proceduralSkills || []);
  return { agentmon: { ...agentmon, outcomeEvents, effectivenessReport, trainedAt: event.recordedAt }, event };
}
