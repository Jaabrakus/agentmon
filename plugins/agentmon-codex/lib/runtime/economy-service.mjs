import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applyAuthorityStateTransition, certifyEconomyHead, readEconomyHead } from "../../scripts/agentmon-db.mjs";
import { certifyCanonicalAgentmon, finalizeAuthorityTransfer, initializeAuthorityRegistry, issueListingCertificate, readAuthorityRecord, verifyAuthorityCertificate } from "../economy/authority-registry.mjs";
import { authorizeStateTransition, issueLearningTransitionAttestation } from "../economy/transition-authority.mjs";
import { createTransitionEnvelope, createTransitionSnapshot } from "../economy/transition-protocol.mjs";
import { createVerificationReceipt, economyDigest, inspectEconomyEligibility, verifyGeneratedArtifacts } from "../economy/verified-economy.mjs";
import { loadTrainerIdentity } from "../ownership/transfer-crypto.mjs";
import { loadEngine, pathsFor, readAgentmonState, readJson, safeSlot, writeJson } from "./storage.mjs";

async function optionalText(path) {
  try { return await readFile(path, "utf8"); } catch { return undefined; }
}

export async function verifyAgentmon(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const slot = safeSlot(options.slot);
  const state = await readAgentmonState(rootDir, slot);
  if (!state) throw new Error(`No Agentmon in slot '${slot}'.`);
  const { createDeploymentPack } = await loadEngine();
  const pack = createDeploymentPack(state);
  const head = await readEconomyHead(rootDir, state.id);
  const receipt = createVerificationReceipt(state, pack, head);
  const sourcePaths = pathsFor(rootDir, slot);
  const artifactDirectory = options.directory ? resolve(rootDir, options.directory) : null;
  const actual = artifactDirectory ? {
    skillMarkdown: await optionalText(resolve(artifactDirectory, "SKILL.md")),
    systemPrompt: await optionalText(resolve(artifactDirectory, "SYSTEM_PROMPT.md")),
    profile: await readJson(resolve(artifactDirectory, "agentmon.json")),
  } : { skillMarkdown: await optionalText(sourcePaths.skill) };
  const artifacts = verifyGeneratedArtifacts(state, pack, actual);
  let authorityCertificateValid = false;
  if (head?.authorityCertificate) {
    try {
      const body = verifyAuthorityCertificate(head.authorityCertificate);
      const certifiedRoot = body.format === "agentmon.authority-state/v1" ? body.stateRoot : body.format === "agentmon.authority-transition/v1" ? body.childStateRoot : null;
      authorityCertificateValid = Boolean(certifiedRoot)
        && body.agentmonId === state.id
        && certifiedRoot === receipt.stateRoot
        && head.authority_fingerprint === head.authorityCertificate.issuer.fingerprint;
    } catch {}
  }
  const actualManifest = artifactDirectory ? await readJson(resolve(artifactDirectory, "manifest.json")) : null;
  const manifestValid = !artifactDirectory || Boolean(actualManifest)
    && economyDigest(actualManifest.verification) === economyDigest(receipt)
    && economyDigest(actualManifest.authorityCertificate || null) === economyDigest(head?.authorityCertificate || null);
  if (!manifestValid) artifacts.mismatches.push("manifestBinding");
  artifacts.valid = artifacts.mismatches.length === 0;
  const valid = receipt.valid && artifacts.valid;
  return {
    ...receipt,
    valid,
    tradable: valid && receipt.status === "verified" && authorityCertificateValid,
    artifacts,
    authorityCertificate: head?.authorityCertificate || null,
    authorityCertificateValid,
    databaseHead: head,
    pack,
    agentmon: state,
  };
}

export async function verifyAgentmonCommand(args) {
  const result = await verifyAgentmon({ ...args, directory: args.out });
  process.stdout.write(`${result.agentmon.form || result.agentmon.species} verification\nState root: ${result.stateRoot}\nEconomy status: ${result.status}\nCanonical state: ${result.checks.canonicalStateMatches ? "valid" : "CHANGED"}\nGenerated artifacts: ${result.artifacts.valid ? "valid" : `CHANGED (${result.artifacts.mismatches.join(", ")})`}\nProcedure provenance: ${result.checks.learnedProcedureProvenance ? "learned-only" : "MODDED"}\nOfficially tradable: ${result.tradable ? "yes" : "no"}\n`);
  if (result.taints.length) process.stdout.write(`Permanent taints: ${result.taints.join(", ")}\n`);
}

export async function initializeEconomyAuthorityCommand(args) {
  const root = resolve(args.registryRoot || args.rootDir, args.registryRoot ? "" : ".agentmon-authority");
  const result = await initializeAuthorityRegistry(root, { name: args.name });
  process.stdout.write(`Development economy authority initialized: ${result.paths.root}\nFingerprint: ${result.fingerprint}\nKeep authority-private-key.pem offline in production.\n`);
}

export async function certifyAgentmonCommand(args) {
  const rootDir = resolve(args.rootDir || process.cwd());
  const registryRoot = resolve(args.registryRoot || resolve(rootDir, ".agentmon-authority"));
  const verification = await verifyAgentmon(args);
  if (!verification.valid) throw new Error("Agentmon failed local verification and cannot be certified.");
  const identity = await loadTrainerIdentity(rootDir);
  const certificate = await certifyCanonicalAgentmon(registryRoot, { agentmon: verification.agentmon, verification, ownerFingerprint: identity.fingerprint });
  await certifyEconomyHead(rootDir, verification.agentmon.id, certificate);
  const output = resolve(rootDir, ".agentmon/economy", `${verification.agentmon.id}-state-certificate.json`);
  const snapshotOutput = resolve(rootDir, ".agentmon/economy", `${verification.agentmon.id}-certified-snapshot.json`);
  await writeJson(output, certificate);
  await writeJson(snapshotOutput, createTransitionSnapshot(verification.agentmon));
  process.stdout.write(`Canonical Agentmon certified.\nState root: ${certificate.stateRoot}\nOwner: ${certificate.ownerFingerprint}\nCertificate: ${output}\nCertified snapshot: ${snapshotOutput}\n`);
}

export async function authorizeAgentmonTransitionCommand(args) {
  const kind = String(args.kind || "");
  if (!new Set(["learning", "evolution"]).has(kind)) throw new Error("economy-transition requires --kind learning|evolution.");
  const rootDir = resolve(args.rootDir || process.cwd());
  const slot = safeSlot(args.slot);
  const registryRoot = resolve(args.registryRoot || resolve(rootDir, ".agentmon-authority"));
  const childAgentmon = await readAgentmonState(rootDir, slot);
  if (!childAgentmon) throw new Error(`No Agentmon in slot '${slot}'.`);
  const snapshotPath = resolve(rootDir, ".agentmon/economy", `${childAgentmon.id}-certified-snapshot.json`);
  const parentAgentmon = await readJson(snapshotPath);
  if (!parentAgentmon) throw new Error("No certified parent snapshot. Re-run authority-certify while the current root is still authoritative.");
  const eligibility = inspectEconomyEligibility(childAgentmon);
  if (!eligibility.eligible) throw new Error(`Modded Agentmon cannot transition: ${eligibility.taints.join(", ")}`);
  const identity = await loadTrainerIdentity(rootDir);
  const privateKey = await readFile(identity.paths.privateKey, "utf8");
  const record = await readAuthorityRecord(registryRoot, childAgentmon.id);
  if (!record.creature) throw new Error("Agentmon is not registered with this authority.");
  let attestation = null;
  if (kind === "learning") {
    attestation = await issueLearningTransitionAttestation(registryRoot, { parentAgentmon, childAgentmon, ownerFingerprint: identity.fingerprint });
  }
  const envelope = createTransitionEnvelope({
    kind,
    parentAgentmon,
    childAgentmon,
    identity,
    privateKey,
    attestation,
    ownershipSequence: Number(record.creature.sequence),
    expectedTransitionSequence: Number(record.creature.transition_sequence),
  });
  const certificate = await authorizeStateTransition(registryRoot, envelope);
  await applyAuthorityStateTransition(rootDir, childAgentmon.id, certificate);
  await writeJson(snapshotPath, createTransitionSnapshot(childAgentmon));
  const transitionPath = resolve(rootDir, ".agentmon/economy", `${certificate.transitionId}.transition.json`);
  await writeJson(transitionPath, { envelope, certificate });
  process.stdout.write(`Verified ${kind} transition applied.\nRoot: ${certificate.parentStateRoot} → ${certificate.childStateRoot}\nTransition sequence: ${certificate.transitionSequence}\nOld active listings cancelled: yes\nCertificate: ${transitionPath}\n`);
}

export async function issueListingCommand(args) {
  const rootDir = resolve(args.rootDir || process.cwd());
  const registryRoot = resolve(args.registryRoot || resolve(rootDir, ".agentmon-authority"));
  const verification = await verifyAgentmon(args);
  if (!verification.tradable) throw new Error("Agentmon is not authority-verified and cannot enter the official economy.");
  const identity = await loadTrainerIdentity(rootDir);
  const expiresAt = new Date(Date.now() + (Number(args.expiresHours) || 24) * 60 * 60 * 1000).toISOString();
  const certificate = await issueListingCertificate(registryRoot, { agentmonId: verification.agentmon.id, stateRoot: verification.stateRoot, ownerFingerprint: identity.fingerprint, expiresAt });
  const output = resolve(rootDir, ".agentmon/economy", `${certificate.listingId}.listing.json`);
  await writeJson(output, certificate);
  process.stdout.write(`Official listing certificate issued.\nListing: ${certificate.listingId}\nState root: ${certificate.stateRoot}\nExpires: ${certificate.expiresAt}\n${output}\n`);
}

export async function finalizeEconomyTransferCommand(args) {
  if (!args.listing || !args.to || args.sequence === undefined) throw new Error("economy-transfer requires --listing ID --to FINGERPRINT --sequence NUMBER.");
  const rootDir = resolve(args.rootDir || process.cwd());
  const registryRoot = resolve(args.registryRoot || resolve(rootDir, ".agentmon-authority"));
  const certificate = await finalizeAuthorityTransfer(registryRoot, { listingId: args.listing, toFingerprint: args.to, expectedSequence: args.sequence });
  const output = resolve(rootDir, ".agentmon/economy", `${certificate.transferId}.transfer.json`);
  await writeJson(output, certificate);
  process.stdout.write(`Authority transfer finalized.\nTransfer: ${certificate.transferId}\nSequence: ${certificate.priorSequence} → ${certificate.sequence}\nNew owner: ${certificate.toFingerprint}\n${output}\n`);
}

export async function showEconomyRecordCommand(args) {
  const state = await readAgentmonState(args.rootDir, safeSlot(args.slot));
  if (!state) throw new Error(`No Agentmon in slot '${args.slot}'.`);
  const registryRoot = resolve(args.registryRoot || resolve(args.rootDir, ".agentmon-authority"));
  const record = await readAuthorityRecord(registryRoot, state.id);
  if (!record.creature) { process.stdout.write("No authority record for this Agentmon.\n"); return; }
  process.stdout.write(`Authority state: ${record.creature.status}\nState root: ${record.creature.state_root}\nOwner: ${record.creature.owner_fingerprint}\nOwnership sequence: ${record.creature.sequence}\nTransition sequence: ${record.creature.transition_sequence}\nVerified transitions: ${record.transitions.length}\nListings: ${record.listings.length}\n`);
}
