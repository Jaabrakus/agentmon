import { createHash, createPublicKey, randomBytes, randomUUID, sign, verify } from "node:crypto";
import { buildAgentmonStateCommitment, economyDigest } from "./verified-economy.mjs";
import { evolveAgentmon } from "../agentmon-engine.mjs";

export const TRANSITION_KINDS = new Set(["learning", "evolution"]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function fingerprint(publicKey) {
  const der = createPublicKey(publicKey).export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex").toUpperCase();
}

function assertRawFree(value, path = "snapshot") {
  if (Array.isArray(value)) return value.forEach((item, index) => assertRawFree(item, `${path}[${index}]`));
  if (!value || typeof value !== "object") return;
  const blocked = /^(?:content|prompt|prompts|prompttext|rawprompt|rawprompttext|response|output|assistanttext|reasoningtext|message|messages)$/i;
  for (const [key, nested] of Object.entries(value)) {
    if (blocked.test(key)) throw new Error(`Transition snapshots may not contain raw text field ${path}.${key}.`);
    assertRawFree(nested, `${path}.${key}`);
  }
}

export function createTransitionSnapshot(agentmon) {
  const snapshot = {
    format: "agentmon.transition-snapshot/v1",
    creationVersion: agentmon.creationVersion || "legacy",
    id: agentmon.id,
    dna: agentmon.dna,
    species: agentmon.species,
    form: agentmon.form || agentmon.species,
    number: agentmon.number,
    trainerName: agentmon.trainerName,
    primaryType: agentmon.primaryType,
    secondaryType: agentmon.secondaryType,
    primaryColor: agentmon.primaryColor,
    accentColor: agentmon.accentColor,
    nature: agentmon.nature,
    natureCopy: agentmon.natureCopy,
    traitKey: agentmon.traitKey,
    traits: agentmon.traits,
    variant: agentmon.variant,
    coreGlyph: agentmon.coreGlyph,
    evolutionStage: agentmon.evolutionStage || agentmon.lineage?.generation || 1,
    nameForge: agentmon.nameForge || null,
    nameHistory: agentmon.nameHistory || [],
    promptprint: agentmon.promptprint,
    growthPromptprint: agentmon.growthPromptprint || agentmon.promptprint,
    moves: agentmon.moves || [],
    learnedSkills: agentmon.learnedSkills || [],
    loops: agentmon.loops || [],
    combinations: agentmon.combinations || [],
    skillTree: agentmon.skillTree || null,
    observations: agentmon.observations || [],
    decisionEpisodes: agentmon.decisionEpisodes || [],
    behaviorHypotheses: agentmon.behaviorHypotheses || [],
    skillCandidates: agentmon.skillCandidates || [],
    procedureProposals: agentmon.procedureProposals || [],
    proceduralSkills: agentmon.proceduralSkills || [],
    procedureTrials: agentmon.procedureTrials || [],
    arenaReport: agentmon.arenaReport || null,
    hatchReadiness: agentmon.hatchReadiness || null,
    outcomeEvents: agentmon.outcomeEvents || [],
    effectivenessReport: agentmon.effectivenessReport || null,
    portabilityResults: agentmon.portabilityResults || [],
    portabilityReport: agentmon.portabilityReport || null,
    skillPackages: agentmon.skillPackages || [],
    ownership: agentmon.ownership || null,
    lineage: agentmon.lineage,
    sourceCount: Number(agentmon.sourceCount) || 0,
    trainingBytes: Number(agentmon.trainingBytes) || 0,
    trainedAt: agentmon.trainedAt,
  };
  assertRawFree(snapshot);
  return snapshot;
}

function itemMap(items, key = "id") {
  const keyFor = typeof key === "function" ? key : (item) => item?.[key];
  return new Map((items || []).map((item) => [keyFor(item), item]).filter(([id]) => id));
}

function assertAppendOnly(parentItems, childItems, label, key = "id") {
  const children = itemMap(childItems, key);
  const keyFor = typeof key === "function" ? key : (item) => item?.[key];
  for (const parent of parentItems || []) {
    const child = children.get(keyFor(parent));
    if (!child || economyDigest(child) !== economyDigest(parent)) throw new Error(`${label} must preserve every certified parent record unchanged.`);
  }
}

function structuralProcedure(procedure) {
  return {
    id: procedure.id, name: procedure.name, description: procedure.description, trigger: procedure.trigger,
    inputs: procedure.inputs || [], steps: procedure.steps || [], completionCriteria: procedure.completionCriteria || [],
    failureRules: procedure.failureRules || [], permissions: procedure.permissions || [], provenance: procedure.provenance || null,
  };
}

export function inspectLearningDelta(parentAgentmon, childAgentmon) {
  const parent = createTransitionSnapshot(parentAgentmon);
  const child = createTransitionSnapshot(childAgentmon);
  const parentCommitment = buildAgentmonStateCommitment(parent);
  const childCommitment = buildAgentmonStateCommitment(child);
  if (parentCommitment.stateRoot === childCommitment.stateRoot) throw new Error("Learning transition does not change committed state.");
  if (parent.id !== child.id) throw new Error("Learning cannot change Agentmon identity.");
  const immutable = (snapshot) => ({
    id: snapshot.id, dna: snapshot.dna, species: snapshot.species, form: snapshot.form, number: snapshot.number,
    trainerName: snapshot.trainerName, promptprint: snapshot.promptprint, nameForge: snapshot.nameForge,
    nameHistory: snapshot.nameHistory, evolutionStage: snapshot.evolutionStage, lineage: snapshot.lineage, ownership: snapshot.ownership,
    primaryType: snapshot.primaryType, secondaryType: snapshot.secondaryType, primaryColor: snapshot.primaryColor,
    accentColor: snapshot.accentColor, nature: snapshot.nature, traitKey: snapshot.traitKey, traits: snapshot.traits,
    variant: snapshot.variant, coreGlyph: snapshot.coreGlyph,
  });
  if (economyDigest(immutable(parent)) !== economyDigest(immutable(child))) throw new Error("Learning may not change identity, hatch DNA, archetype, lineage, or ownership.");
  if (Date.parse(child.trainedAt) < Date.parse(parent.trainedAt)) throw new Error("Learning timestamps cannot move backward.");
  if (child.skillPackages.length) throw new Error("Verified learning cannot introduce imported skill-package content.");
  assertAppendOnly(parent.observations, child.observations, "Learning evidence", "digest");
  assertAppendOnly(parent.outcomeEvents, child.outcomeEvents, "Outcome history");
  const portabilityKey = (result) => `${result?.procedureId}:${result?.provider}:${result?.model}:${result?.suiteDigest}`;
  assertAppendOnly(parent.portabilityResults, child.portabilityResults, "Portability history", portabilityKey);
  const parentAutomatic = parent.procedureTrials.filter((trial) => trial.source === "automatic");
  const childAutomatic = child.procedureTrials.filter((trial) => trial.source === "automatic");
  assertAppendOnly(parentAutomatic, childAutomatic, "Automatic arena history");
  const childProcedures = itemMap(child.proceduralSkills);
  for (const procedure of parent.proceduralSkills) {
    const next = childProcedures.get(procedure.id);
    if (!next || economyDigest(structuralProcedure(next)) !== economyDigest(structuralProcedure(procedure))) throw new Error("Learning may not remove or rewrite a certified procedure structure.");
  }
  for (const collection of [[parent.learnedSkills, child.learnedSkills, "Learned skills"], [parent.loops, child.loops, "Learned loops"]]) {
    const childIds = new Set(collection[1].map((item) => item.id));
    if (collection[0].some((item) => !childIds.has(item.id))) throw new Error(`${collection[2]} may not remove a certified capability.`);
  }
  const priorEvidence = new Set(parent.observations.map((observation) => observation.digest));
  const newEvidenceDigests = child.observations.map((observation) => observation.digest).filter((digest) => !priorEvidence.has(digest)).sort();
  const priorRuns = new Set(parentAutomatic.map((trial) => trial.runId).filter(Boolean));
  const newRunIds = [...new Set(childAutomatic.map((trial) => trial.runId).filter(Boolean).filter((runId) => !priorRuns.has(runId)))].sort();
  const priorOutcomeIds = new Set(parent.outcomeEvents.map((event) => event.id));
  const newOutcomeIds = child.outcomeEvents.map((event) => event.id).filter((id) => !priorOutcomeIds.has(id)).sort();
  const priorPortabilityKeys = new Set(parent.portabilityResults.map(portabilityKey));
  const newPortabilityKeys = child.portabilityResults.map(portabilityKey).filter((key) => !priorPortabilityKeys.has(key)).sort();
  const observationDigests = new Set(child.observations.map((observation) => observation.digest));
  const unboundEvidence = child.proceduralSkills.flatMap((procedure) => procedure.evidenceDigests || []).find((digest) => !observationDigests.has(digest));
  if (unboundEvidence) throw new Error("Procedure evidence must resolve to a committed observation digest.");
  return {
    format: "agentmon.learning-delta/v1",
    agentmonId: parent.id,
    parentStateRoot: parentCommitment.stateRoot,
    childStateRoot: childCommitment.stateRoot,
    newEvidenceDigests,
    newRunIds,
    newOutcomeIds,
    newPortabilityKeys,
    parentSnapshotDigest: economyDigest(parent),
    childSnapshotDigest: economyDigest(child),
  };
}

export function validateEvolutionDelta(parentAgentmon, childAgentmon) {
  const parent = createTransitionSnapshot(parentAgentmon);
  const child = createTransitionSnapshot(childAgentmon);
  const event = child.lineage?.events?.at(-1);
  if (event?.type !== "evolution") throw new Error("Evolution transition requires one final evolution lineage event.");
  if ((child.lineage?.events?.length || 0) !== (parent.lineage?.events?.length || 0) + 1) throw new Error("Evolution must append exactly one lineage event.");
  const expected = createTransitionSnapshot(evolveAgentmon(parent, { evolvedAt: event.at }));
  if (economyDigest(expected) !== economyDigest(child)) throw new Error("Evolution child does not match deterministic engine evolution from the certified parent.");
  return {
    format: "agentmon.evolution-delta/v1",
    agentmonId: parent.id,
    parentStateRoot: buildAgentmonStateCommitment(parent).stateRoot,
    childStateRoot: buildAgentmonStateCommitment(child).stateRoot,
    evolutionEventDigest: economyDigest(event),
    parentSnapshotDigest: economyDigest(parent),
    childSnapshotDigest: economyDigest(child),
  };
}

export function createTransitionEnvelope(input) {
  if (!TRANSITION_KINDS.has(input.kind)) throw new Error("Transition kind must be learning or evolution.");
  const parentAgentmon = createTransitionSnapshot(input.parentAgentmon);
  const childAgentmon = createTransitionSnapshot(input.childAgentmon);
  const delta = input.kind === "learning" ? inspectLearningDelta(parentAgentmon, childAgentmon) : validateEvolutionDelta(parentAgentmon, childAgentmon);
  if (fingerprint(input.identity.publicKey) !== input.identity.fingerprint) throw new Error("Trainer identity fingerprint is invalid.");
  const requestedAt = input.requestedAt || new Date().toISOString();
  const expiresAt = input.expiresAt || new Date(Date.parse(requestedAt) + 10 * 60 * 1000).toISOString();
  if (!Number.isFinite(Date.parse(requestedAt)) || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.parse(requestedAt)) throw new Error("Transition request timestamps are invalid.");
  const request = {
    format: "agentmon.transition-request/v1",
    transitionId: input.transitionId || randomUUID(),
    kind: input.kind,
    agentmonId: parentAgentmon.id,
    parentStateRoot: delta.parentStateRoot,
    childStateRoot: delta.childStateRoot,
    parentSnapshotDigest: delta.parentSnapshotDigest,
    childSnapshotDigest: delta.childSnapshotDigest,
    owner: { name: input.identity.name, fingerprint: input.identity.fingerprint, publicKey: input.identity.publicKey },
    ownershipSequence: Number(input.ownershipSequence) || 0,
    expectedTransitionSequence: Number(input.expectedTransitionSequence) || 0,
    attestationDigest: input.attestation ? economyDigest(input.attestation) : null,
    requestedAt,
    expiresAt,
    nonce: randomBytes(16).toString("hex"),
  };
  const signature = sign(null, Buffer.from(canonicalJson(request)), input.privateKey).toString("base64");
  return { format: "agentmon.transition-envelope/v1", request, parentAgentmon, childAgentmon, attestation: input.attestation || null, signature };
}

export function verifyTransitionEnvelope(envelope) {
  if (envelope?.format !== "agentmon.transition-envelope/v1" || envelope.request?.format !== "agentmon.transition-request/v1") throw new Error("Invalid transition envelope.");
  const request = envelope.request;
  if (!TRANSITION_KINDS.has(request.kind)) throw new Error("Unknown transition kind.");
  if (!Number.isFinite(Date.parse(request.requestedAt)) || !Number.isFinite(Date.parse(request.expiresAt))) throw new Error("Transition request timestamps are invalid.");
  if (Date.parse(request.requestedAt) > Date.now() + 60_000) throw new Error("Transition request is dated too far in the future.");
  if (Date.parse(request.expiresAt) <= Date.now()) throw new Error("Transition request has expired.");
  if (fingerprint(request.owner?.publicKey || "") !== request.owner?.fingerprint) throw new Error("Transition owner fingerprint is invalid.");
  if (!verify(null, Buffer.from(canonicalJson(request)), request.owner.publicKey, Buffer.from(envelope.signature || "", "base64"))) throw new Error("Transition trainer signature is invalid.");
  const parent = createTransitionSnapshot(envelope.parentAgentmon);
  const child = createTransitionSnapshot(envelope.childAgentmon);
  if (request.agentmonId !== parent.id || child.id !== parent.id) throw new Error("Transition Agentmon identity mismatch.");
  if (request.parentSnapshotDigest !== economyDigest(parent) || request.childSnapshotDigest !== economyDigest(child)) throw new Error("Transition snapshot digest mismatch.");
  if (request.attestationDigest !== (envelope.attestation ? economyDigest(envelope.attestation) : null)) throw new Error("Transition attestation digest mismatch.");
  const delta = request.kind === "learning" ? inspectLearningDelta(parent, child) : validateEvolutionDelta(parent, child);
  if (request.parentStateRoot !== delta.parentStateRoot || request.childStateRoot !== delta.childStateRoot) throw new Error("Transition state roots do not match their snapshots.");
  return { request, parentAgentmon: parent, childAgentmon: child, delta };
}
