import { randomBytes, randomUUID } from "node:crypto";
import { isCanonicalRecipeProcedure } from "../agentmon-engine.mjs";
import { verifyEngineInduction } from "../semantics/semantic-induction.mjs";
import { economyDigest, inspectEconomyEligibility } from "./verified-economy.mjs";
import { assertFingerprint, loadAuthority, openAuthorityRegistry, signCertificate, verifyAuthorityCertificate } from "./authority-registry.mjs";
import { inspectLearningDelta, validateEvolutionDelta, verifyTransitionEnvelope } from "./transition-protocol.mjs";

function canonicalProcedure(procedure) {
  return isCanonicalRecipeProcedure(procedure) || verifyEngineInduction(procedure);
}

function equalValues(left, right) {
  return economyDigest(left) === economyDigest(right);
}

export async function issueLearningTransitionAttestation(rootDir, input) {
  const authority = await loadAuthority(rootDir);
  const ownerFingerprint = assertFingerprint(input.ownerFingerprint, "Owner fingerprint");
  const delta = inspectLearningDelta(input.parentAgentmon, input.childAgentmon);
  const store = openAuthorityRegistry(rootDir);
  try {
    const creature = store.db.prepare("SELECT * FROM creatures WHERE agentmon_id = ?").get(delta.agentmonId);
    if (!creature || creature.status !== "active") throw new Error("Agentmon has no active authority record.");
    if (creature.owner_fingerprint !== ownerFingerprint) throw new Error("Only the registered owner may attest learning.");
    if (creature.state_root !== delta.parentStateRoot) throw new Error("Learning attestation parent root is stale.");
    const issuedAt = new Date().toISOString();
    const body = {
      format: "agentmon.learning-attestation/v1",
      attestationId: randomUUID(),
      agentmonId: delta.agentmonId,
      parentStateRoot: delta.parentStateRoot,
      childStateRoot: delta.childStateRoot,
      ownerFingerprint,
      ownershipSequence: Number(creature.sequence),
      transitionSequence: Number(creature.transition_sequence),
      evidenceDigests: delta.newEvidenceDigests,
      arenaRunIds: delta.newRunIds,
      outcomeIds: delta.newOutcomeIds,
      portabilityKeys: delta.newPortabilityKeys,
      issuedAt,
      nonce: randomBytes(16).toString("hex"),
    };
    const certificate = signCertificate(body, authority);
    store.db.prepare(`INSERT INTO transition_attestations(
      id, agentmon_id, parent_state_root, child_state_root, evidence_json, certificate_json, consumed_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`)
      .run(body.attestationId, body.agentmonId, body.parentStateRoot, body.childStateRoot, JSON.stringify({ evidenceDigests: body.evidenceDigests, arenaRunIds: body.arenaRunIds, outcomeIds: body.outcomeIds, portabilityKeys: body.portabilityKeys }), JSON.stringify(certificate), issuedAt);
    return certificate;
  } finally { store.db.close(); }
}

export async function authorizeStateTransition(rootDir, envelope) {
  const verified = verifyTransitionEnvelope(envelope);
  const authority = await loadAuthority(rootDir);
  const request = verified.request;
  const ownerFingerprint = assertFingerprint(request.owner.fingerprint, "Owner fingerprint");
  const eligibility = inspectEconomyEligibility(verified.childAgentmon);
  if (!eligibility.eligible) throw new Error(`Transition child is modded: ${eligibility.taints.join(", ")}`);
  const forged = (verified.childAgentmon.proceduralSkills || []).find((procedure) => !canonicalProcedure(procedure));
  if (forged) throw new Error(`Procedure ${forged.id} is not authority-canonical.`);
  const delta = request.kind === "learning"
    ? inspectLearningDelta(verified.parentAgentmon, verified.childAgentmon)
    : validateEvolutionDelta(verified.parentAgentmon, verified.childAgentmon);
  const store = openAuthorityRegistry(rootDir);
  try {
    store.db.exec("BEGIN IMMEDIATE");
    const creature = store.db.prepare("SELECT * FROM creatures WHERE agentmon_id = ?").get(request.agentmonId);
    if (!creature || creature.status !== "active") throw new Error("Agentmon has no active authority record.");
    if (creature.owner_fingerprint !== ownerFingerprint) throw new Error("Transition signer is not the registered owner.");
    if (Number(request.ownershipSequence) !== Number(creature.sequence)) throw new Error("Ownership sequence mismatch; transition is stale or replayed.");
    if (Number(request.expectedTransitionSequence) !== Number(creature.transition_sequence)) throw new Error("Transition sequence mismatch; transition is stale or replayed.");
    if (creature.state_root !== request.parentStateRoot) throw new Error("Parent state root is no longer authoritative.");
    let attestationId = null;
    if (request.kind === "learning") {
      const attestation = envelope.attestation;
      const body = verifyAuthorityCertificate(attestation);
      if (attestation.issuer.fingerprint !== authority.fingerprint) throw new Error("Learning attestation was signed by a different authority.");
      if (body.format !== "agentmon.learning-attestation/v1") throw new Error("Learning requires an authority learning attestation.");
      if (body.agentmonId !== request.agentmonId || body.parentStateRoot !== request.parentStateRoot || body.childStateRoot !== request.childStateRoot) throw new Error("Learning attestation state roots do not match transition.");
      if (body.ownerFingerprint !== ownerFingerprint || Number(body.ownershipSequence) !== Number(creature.sequence) || Number(body.transitionSequence) !== Number(creature.transition_sequence)) throw new Error("Learning attestation ownership head is stale.");
      if (!equalValues(body.evidenceDigests, delta.newEvidenceDigests) || !equalValues(body.arenaRunIds, delta.newRunIds) || !equalValues(body.outcomeIds, delta.newOutcomeIds) || !equalValues(body.portabilityKeys, delta.newPortabilityKeys)) throw new Error("Learning attestation does not cover the exact evidence delta.");
      const row = store.db.prepare("SELECT * FROM transition_attestations WHERE id = ?").get(body.attestationId);
      if (!row || row.consumed_by) throw new Error("Learning attestation is missing or already consumed.");
      attestationId = body.attestationId;
    } else if (envelope.attestation) {
      throw new Error("Evolution does not accept a learning attestation.");
    }
    const transitionSequence = Number(creature.transition_sequence) + 1;
    const createdAt = new Date().toISOString();
    const body = {
      format: "agentmon.authority-transition/v1",
      transitionId: request.transitionId,
      kind: request.kind,
      agentmonId: request.agentmonId,
      genesisDNA: creature.genesis_dna,
      parentStateRoot: request.parentStateRoot,
      childStateRoot: request.childStateRoot,
      ownerFingerprint,
      ownershipSequence: Number(creature.sequence),
      transitionSequence,
      requestDigest: economyDigest(request),
      attestationId,
      createdAt,
      nonce: randomBytes(16).toString("hex"),
    };
    const certificate = signCertificate(body, authority);
    const update = store.db.prepare(`UPDATE creatures
      SET state_root = ?, transition_sequence = ?, certificate_json = ?, updated_at = ?
      WHERE agentmon_id = ? AND state_root = ? AND transition_sequence = ? AND sequence = ?`)
      .run(body.childStateRoot, transitionSequence, JSON.stringify(certificate), createdAt, body.agentmonId, body.parentStateRoot, request.expectedTransitionSequence, request.ownershipSequence);
    if (update.changes !== 1) throw new Error("Authoritative state changed during transition.");
    store.db.prepare("UPDATE listings SET status = 'cancelled' WHERE agentmon_id = ? AND status = 'active'").run(body.agentmonId);
    if (attestationId) store.db.prepare("UPDATE transition_attestations SET consumed_by = ? WHERE id = ? AND consumed_by IS NULL").run(body.transitionId, attestationId);
    store.db.prepare(`INSERT INTO state_transitions(
      id, agentmon_id, kind, parent_state_root, child_state_root, transition_sequence,
      ownership_sequence, request_digest, certificate_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(body.transitionId, body.agentmonId, body.kind, body.parentStateRoot, body.childStateRoot, transitionSequence, body.ownershipSequence, body.requestDigest, JSON.stringify(certificate), createdAt);
    store.db.exec("COMMIT");
    return certificate;
  } catch (error) {
    try { store.db.exec("ROLLBACK"); } catch {}
    throw error;
  } finally { store.db.close(); }
}
