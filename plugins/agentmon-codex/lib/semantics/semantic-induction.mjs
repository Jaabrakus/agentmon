import { createHash } from "node:crypto";

export const PROCEDURE_COMPILER = "agentmon-procedure-compiler/v1";
const SKILLS = new Set(["reasoning", "web", "code", "memory", "tools", "vision", "planning", "loops", "delegation", "critique"]);
const TRIGGERS = {
  implementation: { text: "A concrete implementation or debugging task needs a bounded, verified result.", permissions: ["read-files", "write-files", "run-tools"], routing: { version: 1, requiredConceptGroups: [["code", "software", "implementation", "debugging"], ["build", "implement", "patch", "fix", "debug", "test"]], excludedConcepts: [], minimumMatchedConcepts: 2, minimumRelevance: 5 } },
  research: { text: "A current or uncertain claim needs authoritative evidence and explicit uncertainty.", permissions: ["network", "read-files"], routing: { version: 1, requiredConceptGroups: [["claim", "research", "evidence", "source"], ["current", "uncertain", "verify", "citation", "source"]], excludedConcepts: [], minimumMatchedConcepts: 2, minimumRelevance: 5 } },
  planning: { text: "A complex objective needs decomposition, dependencies, and measurable completion criteria.", permissions: ["read-files"], routing: { version: 1, requiredConceptGroups: [["objective", "project", "plan"], ["decompose", "dependency", "milestone", "criteria"]], excludedConcepts: [], minimumMatchedConcepts: 2, minimumRelevance: 5 } },
  visual: { text: "A visual artifact needs inspection, comparison, or quality verification.", permissions: ["read-files"], routing: { version: 1, requiredConceptGroups: [["image", "screenshot", "visual", "render"], ["inspect", "compare", "verify", "quality"]], excludedConcepts: [], minimumMatchedConcepts: 2, minimumRelevance: 5 } },
  review: { text: "An artifact or decision needs an independent quality and safety review.", permissions: ["read-files"], routing: { version: 1, requiredConceptGroups: [["artifact", "decision", "output", "change"], ["review", "audit", "quality", "safety"]], excludedConcepts: [], minimumMatchedConcepts: 2, minimumRelevance: 5 } },
  coordination: { text: "Independent work streams need assignment, integration, and a final verification owner.", permissions: ["delegate", "read-files"], routing: { version: 1, requiredConceptGroups: [["workstream", "agent", "team", "task"], ["assign", "delegate", "coordinate", "integrate"]], excludedConcepts: [], minimumMatchedConcepts: 2, minimumRelevance: 5 } },
};
const STEPS = {
  inspect: "Inspect the smallest relevant surface and record observable constraints.",
  clarify: "Resolve consequential ambiguity before committing to an irreversible path.",
  decompose: "Break the objective into bounded work units with explicit dependencies.",
  research: "Consult authoritative evidence and distinguish sourced facts from inference.",
  prototype: "Produce the smallest reversible artifact that can test the core assumption.",
  implement: "Implement the approved bounded change without overwriting unrelated work.",
  compare: "Compare the result against the baseline and the declared acceptance criteria.",
  verify: "Run the relevant deterministic checks and inspect their actual outputs.",
  critique: "Actively search for counterexamples, safety failures, and unsupported claims.",
  iterate: "Apply one evidence-driven correction and repeat only when new evidence exists.",
  integrate: "Reconcile independent contributions and resolve contradictions before delivery.",
  report: "Return the result, verification status, remaining uncertainty, and next safe action.",
};
const COMPLETION = {
  verified: "The declared quality gates pass or every failure is reported with evidence.",
  usable: "The trainer receives an inspectable artifact or decision they can use immediately.",
  sourced: "Material claims are supported by directly usable evidence.",
  integrated: "Every assigned work stream is accounted for in one coherent result.",
};
const FAILURE_RULES = [
  "Stop when required authority, inputs, or permissions are unavailable.",
  "Do not claim a check passed unless its result was actually observed.",
  "Do not expose raw prompts, private responses, credentials, or hidden reasoning.",
];

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function safeId(value) {
  const id = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(id)) throw new Error("Semantic procedure id must use 3-64 lowercase letters, numbers, or hyphens.");
  return id;
}

function safeName(value) {
  const name = String(value || "").replace(/[^a-zA-Z0-9 '&-]/g, "").replace(/\s+/g, " ").trim();
  if (name.length < 3 || name.length > 80) throw new Error("Semantic procedure name must contain 3-80 safe characters.");
  return name;
}

function uniqueKnown(values, catalog, label, minimum, maximum) {
  const result = [...new Set(Array.isArray(values) ? values.map(String) : [])];
  if (result.length < minimum || result.length > maximum || result.some((value) => !catalog.has(value))) throw new Error(`${label} contains an unsupported selection.`);
  return result;
}

export function buildSemanticEvidencePacket(agentmon) {
  const behavioral = (agentmon.observations || []).filter((observation) => ["directive", "personal-preference"].includes(observation.intent));
  const counts = behavioral.reduce((result, observation) => {
    for (const signal of observation.signals || []) result[signal] = (result[signal] || 0) + 1;
    return result;
  }, {});
  return {
    format: "agentmon.semantic-evidence/v1",
    agentmonId: agentmon.id,
    promptprint: { dominant: agentmon.growthPromptprint?.dominant || agentmon.promptprint?.dominant, secondary: agentmon.growthPromptprint?.secondary || agentmon.promptprint?.secondary },
    behavioralObservations: behavioral.length,
    signalCounts: counts,
    learnedCandidates: (agentmon.skillCandidates || []).filter((candidate) => ["validated", "learned"].includes(candidate.stage)).map((candidate) => ({ id: candidate.id, stage: candidate.stage, confidence: candidate.confidence, behavioralEvidenceCount: candidate.behavioralEvidenceCount })),
    existingProcedureIds: (agentmon.proceduralSkills || []).map((procedure) => procedure.id),
    allowedTriggerKinds: Object.keys(TRIGGERS),
    allowedStepPrimitives: Object.keys(STEPS),
    allowedCompletionPrimitives: Object.keys(COMPLETION),
    privacy: { rawPromptsIncluded: false, rawResponsesIncluded: false },
  };
}

export function compileSemanticSuggestion(agentmon, suggestion, metadata = {}) {
  const evidence = buildSemanticEvidencePacket(agentmon);
  if (evidence.behavioralObservations < 3) throw new Error("Semantic induction requires at least three behavioral observations.");
  const id = safeId(suggestion.id);
  if (evidence.existingProcedureIds.includes(id)) throw new Error(`Procedure already exists: ${id}.`);
  const triggerKind = String(suggestion.triggerKind || "");
  if (!Object.hasOwn(TRIGGERS, triggerKind)) throw new Error("Semantic suggestion contains an unsupported trigger kind.");
  const skills = uniqueKnown(suggestion.skills, SKILLS, "Semantic skills", 1, 4);
  const learned = new Map(evidence.learnedCandidates.map((candidate) => [candidate.id, candidate]));
  if (skills.some((skill) => !learned.has(skill))) throw new Error("Semantic suggestions may use only validated or learned capability evidence.");
  const stepIds = uniqueKnown(suggestion.steps, new Set(Object.keys(STEPS)), "Semantic steps", 2, 8);
  const completionIds = uniqueKnown(suggestion.completion, new Set(Object.keys(COMPLETION)), "Semantic completion criteria", 1, 3);
  const evidenceDigests = [...new Set((agentmon.observations || []).filter((observation) => ["directive", "personal-preference"].includes(observation.intent) && (observation.signals || []).some((signal) => skills.includes(signal))).map((observation) => observation.digest))];
  if (evidenceDigests.length < 3) throw new Error("Semantic suggestion lacks three matching behavioral evidence records.");
  const structure = { id, name: safeName(suggestion.name), triggerKind, skills, stepIds, completionIds };
  return {
    format: "agentmon.semantic-procedure-candidate/v1",
    id,
    name: structure.name,
    description: `A trainer-specific ${triggerKind} workflow compiled from repeated ${skills.join(" + ")} behavior.`,
    trigger: TRIGGERS[triggerKind].text,
    routing: TRIGGERS[triggerKind].routing,
    inputs: ["Current objective and constraints", "Relevant authorized context", "Acceptance criteria and budget"],
    steps: stepIds.map((step) => STEPS[step]),
    completionCriteria: completionIds.map((criterion) => COMPLETION[criterion]),
    failureRules: FAILURE_RULES,
    permissions: TRIGGERS[triggerKind].permissions,
    skills,
    evidenceDigests,
    evidenceCount: evidenceDigests.length,
    confidence: Math.min(79, Math.round(skills.reduce((sum, skill) => sum + learned.get(skill).confidence, 0) / skills.length)),
    trainerReview: "unreviewed",
    status: "proposed",
    provenance: {
      kind: "engine-induction",
      version: 1,
      compiler: PROCEDURE_COMPILER,
      structure,
      structureDigest: digest(structure),
      evidenceRoot: digest([...evidenceDigests].sort()),
      proposer: metadata.model ? { mode: "shadow", modelDigest: digest(metadata.model) } : { mode: "deterministic" },
      rawPromptsIncluded: false,
    },
  };
}

export function addSemanticCandidates(agentmon, suggestions, metadata = {}) {
  const compiled = suggestions.slice(0, 4).map((suggestion) => compileSemanticSuggestion(agentmon, suggestion, metadata));
  const byId = new Map((agentmon.procedureProposals || []).map((candidate) => [candidate.id, candidate]));
  compiled.forEach((candidate) => byId.set(candidate.id, candidate));
  return { ...agentmon, procedureProposals: [...byId.values()], trainedAt: new Date().toISOString() };
}

export function reviewSemanticCandidate(agentmon, candidateId, review) {
  if (!new Set(["confirmed", "rejected"]).has(review)) throw new Error("Semantic candidate review must be confirmed or rejected.");
  const candidate = (agentmon.procedureProposals || []).find((item) => item.id === candidateId);
  if (!candidate) throw new Error(`Unknown semantic candidate: ${candidateId}.`);
  const procedureProposals = agentmon.procedureProposals.map((item) => item.id === candidateId ? { ...item, trainerReview: review, status: review === "confirmed" ? "trainer-confirmed" : "rejected", reviewedAt: new Date().toISOString() } : item);
  return { ...agentmon, procedureProposals, trainedAt: new Date().toISOString() };
}

export function promoteSemanticCandidate(agentmon, candidateId) {
  const candidate = (agentmon.procedureProposals || []).find((item) => item.id === candidateId);
  if (!candidate || candidate.trainerReview !== "confirmed") throw new Error("Only a trainer-confirmed semantic candidate can enter arena testing.");
  if (agentmon.proceduralSkills?.some((procedure) => procedure.id === candidate.id)) throw new Error(`Procedure already exists: ${candidate.id}.`);
  const { format, status, skills, reviewedAt, ...compiled } = candidate;
  const procedure = { ...compiled, stage: "validated", behavioralEvidenceCount: candidate.evidenceCount, trainerConfirmed: true, trainerReview: "confirmed" };
  const proceduralSkills = [...(agentmon.proceduralSkills || []), procedure];
  const procedureProposals = agentmon.procedureProposals.map((item) => item.id === candidateId ? { ...item, status: "testing" } : item);
  return { agentmon: { ...agentmon, procedureProposals, proceduralSkills, trainedAt: new Date().toISOString() }, procedure };
}

export function verifyEngineInduction(procedure) {
  try {
    const provenance = procedure?.provenance;
    if (provenance?.kind !== "engine-induction" || provenance.version !== 1 || provenance.compiler !== PROCEDURE_COMPILER) return false;
    if (!/^[a-f0-9]{64}$/.test(provenance.structureDigest || "") || !/^[a-f0-9]{64}$/.test(provenance.evidenceRoot || "")) return false;
    if (!Array.isArray(procedure.evidenceDigests) || procedure.evidenceDigests.length < 3) return false;
    const structure = provenance.structure;
    if (!structure || provenance.structureDigest !== digest(structure)) return false;
    const trigger = TRIGGERS[structure.triggerKind];
    if (!trigger || safeId(structure.id) !== procedure.id || safeName(structure.name) !== procedure.name) return false;
    const skills = uniqueKnown(structure.skills, SKILLS, "Semantic skills", 1, 4);
    const stepIds = uniqueKnown(structure.stepIds, new Set(Object.keys(STEPS)), "Semantic steps", 2, 8);
    const completionIds = uniqueKnown(structure.completionIds, new Set(Object.keys(COMPLETION)), "Semantic completion criteria", 1, 3);
    const expectedDescription = `A trainer-specific ${structure.triggerKind} workflow compiled from repeated ${skills.join(" + ")} behavior.`;
    if (procedure.description !== expectedDescription || procedure.trigger !== trigger.text) return false;
    if (digest(procedure.inputs) !== digest(["Current objective and constraints", "Relevant authorized context", "Acceptance criteria and budget"])) return false;
    if (digest(procedure.permissions) !== digest(trigger.permissions) || digest(procedure.routing) !== digest(trigger.routing)) return false;
    if (digest(procedure.steps) !== digest(stepIds.map((step) => STEPS[step]))) return false;
    if (digest(procedure.completionCriteria) !== digest(completionIds.map((criterion) => COMPLETION[criterion]))) return false;
    if (digest(procedure.failureRules) !== digest(FAILURE_RULES)) return false;
    return provenance.evidenceRoot === digest([...new Set(procedure.evidenceDigests)].sort());
  } catch {
    return false;
  }
}
