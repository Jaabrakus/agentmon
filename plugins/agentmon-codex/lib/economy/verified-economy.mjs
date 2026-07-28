import { createHash } from "node:crypto";
import { canonicalProcedureProvenance } from "../agentmon-engine.mjs";

export const ECONOMY_FORMAT = "agentmon.economy/v1";
export const ECONOMY_STATUSES = new Set(["local-unverified", "verified", "modded", "revoked"]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

export function economyDigest(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function normalizedProcedure(procedure) {
  return {
    id: procedure.id,
    name: procedure.name,
    description: procedure.description,
    stage: procedure.stage,
    confidence: procedure.confidence,
    evidenceCount: procedure.evidenceCount,
    behavioralEvidenceCount: procedure.behavioralEvidenceCount,
    trigger: procedure.trigger,
    ...(procedure.routing ? { routing: procedure.routing } : {}),
    inputs: procedure.inputs || [],
    steps: procedure.steps || [],
    completionCriteria: procedure.completionCriteria || [],
    failureRules: procedure.failureRules || [],
    permissions: [...(procedure.permissions || [])].sort(),
    evidenceDigests: [...new Set(procedure.evidenceDigests || [])].sort(),
    trainerConfirmed: Boolean(procedure.trainerConfirmed),
    trainerReview: procedure.trainerReview || null,
    provenance: procedure.provenance || null,
  };
}

export function buildProcedureRevision(agentmon, procedure) {
  const content = normalizedProcedure(procedure);
  return {
    format: "agentmon.procedure-revision/v1",
    agentmonId: agentmon.id,
    procedureId: procedure.id,
    provenanceKind: procedure.provenance?.kind || "unknown",
    engineVersion: String(procedure.provenance?.version || 0),
    evidenceRoot: economyDigest(content.evidenceDigests),
    contentDigest: economyDigest(content),
    revisionDigest: economyDigest({ agentmonId: agentmon.id, currentDNA: agentmon.lineage?.currentDNA || agentmon.dna, content }),
  };
}

export function inspectEconomyEligibility(agentmon) {
  const taints = [];
  const procedures = agentmon.proceduralSkills || [];
  for (const procedure of procedures) {
    if (canonicalProcedureProvenance(procedure) === "untrusted") taints.push(`unverified-procedure:${procedure.id}:${procedure.provenance?.kind || "unknown"}`);
  }
  if ((agentmon.skillPackages || []).length) taints.push("imported-skill-package-content");
  if (agentmon.ownership?.status === "unverified-copy") taints.push("unverified-copy");
  return { eligible: taints.length === 0, taints: [...new Set(taints)].sort() };
}

export function buildAgentmonStateCommitment(agentmon) {
  const lineage = agentmon.lineage || {};
  const procedureRevisions = (agentmon.proceduralSkills || [])
    .map((procedure) => buildProcedureRevision(agentmon, procedure))
    .sort((left, right) => left.procedureId.localeCompare(right.procedureId));
  const automaticTrials = (agentmon.procedureTrials || [])
    .filter((trial) => trial.source === "automatic")
    .map((trial) => ({
      id: trial.id,
      procedureId: trial.procedureId,
      variant: trial.variant,
      decisionQuality: trial.decisionQuality,
      outcome: trial.outcome,
      runId: trial.runId || null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const derivedState = {
    growthPromptprint: agentmon.growthPromptprint || agentmon.promptprint || null,
    moves: agentmon.moves || [],
    observations: agentmon.observations || [],
    decisionEpisodes: agentmon.decisionEpisodes || [],
    learnedSkills: agentmon.learnedSkills || [],
    loops: agentmon.loops || [],
    combinations: agentmon.combinations || [],
    skillTree: agentmon.skillTree || null,
    behaviorHypotheses: agentmon.behaviorHypotheses || [],
    skillCandidates: agentmon.skillCandidates || [],
    procedureProposals: agentmon.procedureProposals || [],
    arenaReport: agentmon.arenaReport || null,
    hatchReadiness: agentmon.hatchReadiness || null,
    effectivenessReport: agentmon.effectivenessReport || null,
    outcomeEvents: agentmon.outcomeEvents || [],
    portabilityResults: agentmon.portabilityResults || [],
    portabilityReport: agentmon.portabilityReport || null,
  };
  const state = {
    format: "agentmon.state-commitment/v2",
    agentmonId: agentmon.id,
    genesisDNA: lineage.genesisDNA || agentmon.dna,
    currentDNA: lineage.currentDNA || agentmon.dna,
    generation: Number(lineage.generation) || 1,
    permanentArchetype: agentmon.promptprint?.archetype || null,
    hatchPromptprint: agentmon.promptprint?.signature || null,
    hatchPromptprintRoot: economyDigest(agentmon.promptprint || null),
    ownerFingerprint: agentmon.ownership?.ownerFingerprint || null,
    ownershipSequence: Number(agentmon.ownership?.transferSequence) || 0,
    ownershipRoot: economyDigest(agentmon.ownership || null),
    identityRoot: economyDigest({
      trainerName: agentmon.trainerName,
      species: agentmon.species,
      form: agentmon.form || agentmon.species,
      number: agentmon.number,
      nature: agentmon.nature,
      natureCopy: agentmon.natureCopy,
      traitKey: agentmon.traitKey,
      traits: agentmon.traits,
      primaryType: agentmon.primaryType,
      secondaryType: agentmon.secondaryType,
      primaryColor: agentmon.primaryColor,
      accentColor: agentmon.accentColor,
      variant: agentmon.variant,
      coreGlyph: agentmon.coreGlyph,
      evolutionStage: agentmon.evolutionStage || lineage.generation || 1,
      nameForge: agentmon.nameForge || null,
      nameHistory: agentmon.nameHistory || [],
    }),
    lineageRoot: economyDigest(lineage),
    derivedStateRoot: economyDigest(derivedState),
    procedureRevisions,
    automaticTrials,
  };
  return { ...state, stateRoot: economyDigest(state) };
}

export function buildArtifactDigests(pack) {
  return {
    skillMarkdown: economyDigest(pack.skillMarkdown),
    systemPrompt: economyDigest(pack.systemPrompt),
    profile: economyDigest(pack.profile),
  };
}

export function verifyGeneratedArtifacts(agentmon, pack, actual = {}) {
  const expected = buildArtifactDigests(pack);
  const supplied = Object.fromEntries(Object.keys(expected).map((key) => [key, Object.prototype.hasOwnProperty.call(actual, key)]));
  const actualDigests = {
    skillMarkdown: actual.skillMarkdown === undefined ? null : economyDigest(actual.skillMarkdown),
    systemPrompt: actual.systemPrompt === undefined ? null : economyDigest(actual.systemPrompt),
    profile: actual.profile === undefined ? null : economyDigest(actual.profile),
  };
  const mismatches = Object.keys(actualDigests).filter((key) => supplied[key] && actualDigests[key] !== expected[key]);
  return { valid: mismatches.length === 0, expected, actual: actualDigests, mismatches };
}

export function createVerificationReceipt(agentmon, pack, economyHead = null) {
  const commitment = buildAgentmonStateCommitment(agentmon);
  const eligibility = inspectEconomyEligibility(agentmon);
  const stateMatches = !economyHead || economyHead.state_root === commitment.stateRoot;
  const status = economyHead?.status || (eligibility.eligible ? "local-unverified" : "modded");
  const valid = eligibility.eligible && stateMatches && status !== "revoked";
  return {
    format: "agentmon.verification-receipt/v1",
    agentmonId: agentmon.id,
    stateRoot: commitment.stateRoot,
    procedureRevisions: commitment.procedureRevisions,
    artifactDigests: buildArtifactDigests(pack),
    status,
    valid,
    tradable: valid && status === "verified",
    taints: eligibility.taints,
    checks: { canonicalStateMatches: stateMatches, learnedProcedureProvenance: eligibility.eligible },
  };
}
