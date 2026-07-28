import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createIsolatedWorkspace, runIsolatedProof } from "../lib/proof/isolated-workspace.mjs";
import { createHumanScoringPacket, pairedHumanStatistics } from "../lib/proof/human-scoring.mjs";
import { issueProofCertificate, verifyProofCertificate } from "../lib/proof/proof-certificate.mjs";
import { applyOwnershipCommand, createOwnershipHead, verifyOwnershipHead } from "../lib/ownership/ownership-authority.mjs";

const A = "A".repeat(64); const B = "B".repeat(64); const AUTHORITY = "C".repeat(64); const RECOVERY = "D".repeat(64);

test("copies proof inputs into a private raw-free snapshot and runs without mutating the source", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "agentmon-isolation-test-"));
  try {
    await mkdir(join(rootDir, ".agentmon")); await writeFile(join(rootDir, ".agentmon", "private.json"), "secret");
    await writeFile(join(rootDir, ".env"), "TOKEN=secret"); await writeFile(join(rootDir, "task.txt"), "original");
    const snapshot = await createIsolatedWorkspace(rootDir);
    assert.equal(await readFile(join(snapshot.workspace, "task.txt"), "utf8"), "original");
    await assert.rejects(() => readFile(join(snapshot.workspace, ".agentmon", "private.json")), /ENOENT/);
    await snapshot.cleanup();
    const run = await runIsolatedProof({ rootDir, command: process.execPath, args: ["-e", "require('fs').writeFileSync('task.txt','changed')"] });
    assert.equal(run.code, 0); assert.equal(run.networkIsolated, false);
    assert.equal(await readFile(join(rootDir, "task.txt"), "utf8"), "original");
  } finally { await rm(rootDir, { recursive: true, force: true }); }
});

test("blinds human packets and calculates paired statistics without publishing task text", () => {
  const { packet, secretMap } = createHumanScoringPacket({ id: "run-1", artifacts: [{ taskId: "task-1", instruction: "private", outputs: { baseline: "one", agentmon: "two" } }] }, { nonce: "fixed" });
  const mapping = secretMap["task-1:1"];
  const agentmonLabel = Object.keys(mapping).find((label) => mapping[label] === "agentmon");
  const baselineLabel = Object.keys(mapping).find((label) => mapping[label] === "baseline");
  const stats = pairedHumanStatistics(packet, [{ raterId: "rater-1", scores: [{ taskKey: "task-1:1", preferred: agentmonLabel, values: { [agentmonLabel]: 90, [baselineLabel]: 70 } }] }], secretMap);
  assert.equal(stats.meanLift, 20); assert.equal(stats.winRate, 100); assert.equal(stats.rawTaskTextIncluded, false);
});

test("issues tamper-evident raw-free Ed25519 proof certificates", () => {
  const keys = generateKeyPairSync("ed25519", { privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const certificate = issueProofCertificate({ proofId: "proof-1", agentmonId: "AGM-1", procedureDigest: "a".repeat(64), configDigest: "b".repeat(64), evidenceRoot: "c".repeat(64), taskCount: 12, safety: { passed: true, findings: [] } }, { ...keys, name: "Local Proof Runner" });
  assert.equal(verifyProofCertificate(certificate), certificate);
  assert.throws(() => verifyProofCertificate({ ...certificate, taskCount: 13 }), /id is invalid/);
});

test("enforces ownership compare-and-swap, transfer freezing, disputes, revocation and recovery", () => {
  const genesis = createOwnershipHead({ creatureId: "AGM-1", genesisDNA: "DNA1", currentDNA: "DNA1", ownerFingerprint: A, createdAt: "2026-01-01T00:00:00.000Z" });
  const proposed = applyOwnershipCommand(genesis, { type: "propose-transfer", actorFingerprint: A, recipientFingerprint: B, transferId: "transfer-1", expiresAt: "2026-02-01T00:00:00.000Z", expectedSequence: 0, expectedHeadDigest: genesis.headDigest, at: "2026-01-02T00:00:00.000Z" });
  assert.equal(proposed.status, "pending-transfer");
  assert.throws(() => applyOwnershipCommand(proposed, { type: "cancel-transfer", actorFingerprint: A, expectedSequence: 0, expectedHeadDigest: genesis.headDigest }), /compare-and-swap conflict/);
  const accepted = applyOwnershipCommand(proposed, { type: "accept-transfer", actorFingerprint: B, expectedSequence: 1, expectedHeadDigest: proposed.headDigest, at: "2026-01-03T00:00:00.000Z" });
  assert.equal(accepted.ownerFingerprint, B);
  const disputed = applyOwnershipCommand(accepted, { type: "open-dispute", actorFingerprint: B, disputeId: "dispute-1", reasonCode: "key-compromise", expectedSequence: 2, expectedHeadDigest: accepted.headDigest });
  const resolved = applyOwnershipCommand(disputed, { type: "resolve-dispute", actorFingerprint: AUTHORITY, authorityFingerprint: AUTHORITY, ownerFingerprint: A, expectedSequence: 3, expectedHeadDigest: disputed.headDigest });
  const recovered = applyOwnershipCommand(resolved, { type: "recover", actorFingerprint: RECOVERY, recoveryAuthorityFingerprint: RECOVERY, newOwnerFingerprint: B, evidenceDigest: "evidence", expectedSequence: 4, expectedHeadDigest: resolved.headDigest });
  const revoked = applyOwnershipCommand(recovered, { type: "revoke", actorFingerprint: AUTHORITY, authorityFingerprint: AUTHORITY, reasonCode: "fraud", expectedSequence: 5, expectedHeadDigest: recovered.headDigest });
  assert.equal(verifyOwnershipHead(revoked).status, "revoked");
});
