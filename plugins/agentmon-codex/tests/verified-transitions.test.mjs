import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyAuthorityStateTransition, certifyEconomyHead } from "../scripts/agentmon-db.mjs";
import { createTrainerIdentity, processFeed } from "../scripts/agentmon.mjs";
import { evolveAgentmon } from "../lib/agentmon-engine.mjs";
import { certifyCanonicalAgentmon, initializeAuthorityRegistry, issueListingCertificate, readAuthorityRecord } from "../lib/economy/authority-registry.mjs";
import { authorizeStateTransition, issueLearningTransitionAttestation } from "../lib/economy/transition-authority.mjs";
import { createTransitionEnvelope } from "../lib/economy/transition-protocol.mjs";
import { verifyAgentmon } from "../lib/runtime/economy-service.mjs";

function feed(revision, prompts) {
  return {
    format: "agentmon.feed/v1",
    source: "verified-transition-test",
    revision,
    generatedAt: new Date().toISOString(),
    consent: { scope: "user_prompts_only" },
    thread: { id: "transition-test", label: "Transition test" },
    prompts: prompts.map((text, index) => ({ id: `${revision}-${index + 1}`, text, chars: text.length, redactions: 0 })),
    totals: { prompts: prompts.length, characters: prompts.reduce((sum, value) => sum + value.length, 0), redactions: 0 },
  };
}

async function signedEnvelope(kind, parentAgentmon, childAgentmon, identity, record, attestation = null) {
  const privateKey = await readFile(identity.paths.privateKey, "utf8");
  return createTransitionEnvelope({
    kind,
    parentAgentmon,
    childAgentmon,
    identity,
    privateKey,
    attestation,
    ownershipSequence: Number(record.creature.sequence),
    expectedTransitionSequence: Number(record.creature.transition_sequence),
  });
}

test("advances learned state once, preserves authority verification, and cancels stale listings", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "agentmon-learning-transition-"));
  const registryRoot = await mkdtemp(join(tmpdir(), "agentmon-learning-authority-"));
  try {
    const identity = await createTrainerIdentity({ rootDir, name: "Nova" });
    const first = await processFeed(feed("learning-1", [
      "Build the smallest patch and verify it with focused tests.",
      "Inspect the failure, use approved tools, and report evidence.",
      "Implement the fix, run checks, and retry if needed.",
      "Keep permissions bounded and stop when verification fails.",
    ]), { rootDir, slot: "main", name: "Nova", role: "builder", retention: "derived-only" });
    await initializeAuthorityRegistry(registryRoot, { name: "Learning Registry" });
    const local = await verifyAgentmon({ rootDir, slot: "main" });
    const initialCertificate = await certifyCanonicalAgentmon(registryRoot, { agentmon: first.agentmon, verification: local, ownerFingerprint: identity.fingerprint });
    await certifyEconomyHead(rootDir, first.agentmon.id, initialCertificate);
    const listing = await issueListingCertificate(registryRoot, { agentmonId: first.agentmon.id, stateRoot: local.stateRoot, ownerFingerprint: identity.fingerprint });

    const second = await processFeed(feed("learning-2", [
      "Compare the implementation to the requirements, run the focused tests, then document any uncertainty.",
    ]), { rootDir, slot: "main", name: "Nova", role: "builder", retention: "derived-only" });
    const before = await readAuthorityRecord(registryRoot, first.agentmon.id);
    const attestation = await issueLearningTransitionAttestation(registryRoot, { parentAgentmon: first.agentmon, childAgentmon: second.agentmon, ownerFingerprint: identity.fingerprint });
    const envelope = await signedEnvelope("learning", first.agentmon, second.agentmon, identity, before, attestation);
    const badSignature = structuredClone(envelope);
    badSignature.signature = `${badSignature.signature.slice(0, -2)}AA`;
    await assert.rejects(() => authorizeStateTransition(registryRoot, badSignature), /signature is invalid/);

    const certificate = await authorizeStateTransition(registryRoot, envelope);
    assert.equal(certificate.kind, "learning");
    assert.equal(certificate.transitionSequence, 1);
    assert.notEqual(certificate.parentStateRoot, certificate.childStateRoot);
    await applyAuthorityStateTransition(rootDir, second.agentmon.id, certificate);
    const verified = await verifyAgentmon({ rootDir, slot: "main" });
    assert.equal(verified.tradable, true);
    assert.equal(verified.stateRoot, certificate.childStateRoot);

    const after = await readAuthorityRecord(registryRoot, second.agentmon.id);
    assert.equal(after.creature.transition_sequence, 1);
    assert.equal(after.transitions.length, 1);
    assert.equal(after.listings.find((item) => item.id === listing.listingId).status, "cancelled");
    await assert.rejects(() => authorizeStateTransition(registryRoot, envelope), /stale or replayed|no longer authoritative/);

    const edited = structuredClone(second.agentmon);
    edited.nature = "USER EDITED";
    await assert.rejects(() => signedEnvelope("learning", second.agentmon, edited, identity, after, null), /may not change identity/);
  } finally {
    await Promise.all([rootDir, registryRoot].map((path) => rm(path, { recursive: true, force: true })));
  }
});

test("authorizes only the deterministic engine evolution from the certified parent", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "agentmon-evolution-transition-"));
  const registryRoot = await mkdtemp(join(tmpdir(), "agentmon-evolution-authority-"));
  try {
    const identity = await createTrainerIdentity({ rootDir, name: "Aster" });
    const trained = await processFeed(feed("evolution-1", [
      "Build and verify the implementation with tools.",
      "Review the result and retry failed checks.",
      "Use evidence to explain the final decision.",
    ]), { rootDir, slot: "main", name: "Aster", role: "builder", retention: "derived-only" });
    const parent = structuredClone(trained.agentmon);
    parent.skillTree = {
      inheritedSkills: parent.learnedSkills.slice(0, 1),
      acquiredSkills: parent.learnedSkills.slice(1, 2),
      inheritedLoops: [],
      acquiredLoops: parent.loops || [],
      fusionMoves: [{ id: "fusion-proof", name: "Proof Fusion", type: "logic", power: 90, description: "Combines inherited and acquired verification.", icon: "◆", evidence: 2 }],
    };
    await initializeAuthorityRegistry(registryRoot, { name: "Evolution Registry" });
    await certifyCanonicalAgentmon(registryRoot, { agentmon: parent, ownerFingerprint: identity.fingerprint });
    const listing = await issueListingCertificate(registryRoot, {
      agentmonId: parent.id,
      stateRoot: (await readAuthorityRecord(registryRoot, parent.id)).creature.state_root,
      ownerFingerprint: identity.fingerprint,
    });
    const record = await readAuthorityRecord(registryRoot, parent.id);
    const child = evolveAgentmon(parent, { evolvedAt: "2026-07-27T12:00:00.000Z" });
    const envelope = await signedEnvelope("evolution", parent, child, identity, record);
    const certificate = await authorizeStateTransition(registryRoot, envelope);
    assert.equal(certificate.kind, "evolution");
    assert.equal(certificate.transitionSequence, 1);
    const after = await readAuthorityRecord(registryRoot, parent.id);
    assert.equal(after.creature.state_root, certificate.childStateRoot);
    assert.equal(after.listings.find((item) => item.id === listing.listingId).status, "cancelled");

    const forged = structuredClone(child);
    forged.dna = "DEADBEEFDEADBEEF";
    forged.lineage.currentDNA = forged.dna;
    const nextRecord = await readAuthorityRecord(registryRoot, parent.id);
    await assert.rejects(() => signedEnvelope("evolution", parent, forged, identity, nextRecord), /does not match deterministic engine evolution/);
  } finally {
    await Promise.all([rootDir, registryRoot].map((path) => rm(path, { recursive: true, force: true })));
  }
});
