import { chmod, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { listAgentmonSnapshots, persistAgentmonSnapshot, readEconomyHead } from "../../scripts/agentmon-db.mjs";
import { createVerificationReceipt } from "../economy/verified-economy.mjs";
import { createSignedTransfer, createTrainerIdentity, loadTrainerIdentity, sealTradePackage, updateOwnershipRegistry, verifySignedTransfer, verifyTradePackage } from "../ownership/transfer-crypto.mjs";
import { ENGINE_VERSION, VALID_PROVIDERS, VALID_ROLES, atomicWrite, growthProfile, loadEngine, pathsFor, readAgentmonState, readJson, safeSlot, writeJson } from "./storage.mjs";
import { formatCard, updateSquad } from "./training-service.mjs";

export async function exportDeploymentPack(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const slot = safeSlot(options.slot);
  const state = await readAgentmonState(rootDir, slot);
  if (!state) throw new Error(`No Agentmon in slot '${slot}'.`);
  if (state.ownership?.status === "pending-transfer") throw new Error("A pending whole-Agentmon transfer freezes deployment until it is accepted, expired, or cancelled.");
  const { createDeploymentPack } = await loadEngine();
  const pack = createDeploymentPack(state);
  const economyHead = await readEconomyHead(rootDir, state.id);
  const verification = createVerificationReceipt(state, pack, economyHead);
  pack.manifest = { ...pack.manifest, verification, authorityCertificate: economyHead?.authorityCertificate || null };
  const output = options.out || resolve(rootDir, ".agentmon/deploy", `${slot}-${state.id}`);
  await atomicWrite(resolve(output, "SKILL.md"), pack.skillMarkdown);
  await atomicWrite(resolve(output, "SYSTEM_PROMPT.md"), pack.systemPrompt);
  await writeJson(resolve(output, "agentmon.json"), pack.profile);
  await writeJson(resolve(output, "manifest.json"), pack.manifest);
  await Promise.all(["SKILL.md", "SYSTEM_PROMPT.md", "agentmon.json", "manifest.json"].map((name) => chmod(resolve(output, name), 0o444)));
  return { output, pack, agentmon: state, verification };
}

export async function deployAgentmon(args) {
  const result = await exportDeploymentPack(args);
  const arena = new Map((result.agentmon.arenaReport?.results || []).map((item) => [item.procedureId, item.status]));
  const ready = result.agentmon.proceduralSkills?.filter((procedure) => ["validated", "learned"].includes(procedure.stage) && procedure.trainerReview === "confirmed" && arena.get(procedure.id) === "proven").length || 0;
  process.stdout.write(`LLM runtime pack created: ${result.output}\nConfirmed, arena-proven executable procedures: ${ready}\nState root: ${result.verification.stateRoot}\nEconomy status: ${result.verification.status} · officially tradable ${result.verification.tradable ? "yes" : "no"}\nGenerated files are read-only hints; cryptographic verification is the enforcement boundary.\nRaw prompts, credentials, and private keys included: no\n`);
}

export async function listSquad(args) {
  const databaseMembers = await listAgentmonSnapshots(args.rootDir);
  if (databaseMembers.length) {
    for (const member of databaseMembers) process.stdout.write(`${member.slot}\t${member.species}\t${member.role}\tGEN ${member.generation}\t${member.ownership_status}\n`);
    return;
  }
  const squad = await readJson(pathsFor(args.rootDir, args.slot).squad, { members: [] });
  if (!squad.members.length) { process.stdout.write("No Agentmons hatched in this project.\n"); return; }
  for (const member of squad.members) process.stdout.write(`${member.slot}\t${member.species}\t${member.role}\t${member.confidence}%\t${member.skills} skills\n`);
}

export async function exportAgentmon(args) {
  const paths = pathsFor(args.rootDir, args.slot);
  const state = await readAgentmonState(args.rootDir, args.slot);
  if (!state) throw new Error(`No Agentmon in slot '${args.slot}'.`);
  const { createTradePackage } = await loadEngine();
  const output = args.out || resolve(args.rootDir, ".agentmon/exports", `${args.slot}-${state.id}.agentmon.json`);
  const tradePackage = sealTradePackage(createTradePackage(state));
  await writeJson(output, tradePackage);
  process.stdout.write(`Whole-Agentmon package exported: ${output}\nFormat: ${tradePackage.format} · ${tradePackage.manifest?.includedSections?.length || 0} independently digested sections\nIntegrity: ${tradePackage.integrity.digest.slice(0, 16)}…\nRaw prompts, credentials, and executable skill contents included: no\n`);
}

export async function importAgentmonPackage(tradePackage, options = {}) {
  const unsignedPackage = verifyTradePackage(tradePackage);
  const rootDir = resolve(options.rootDir || process.cwd());
  const slot = safeSlot(options.slot);
  const paths = pathsFor(rootDir, slot);
  if (await readAgentmonState(rootDir, slot)) throw new Error(`Slot '${slot}' already contains an Agentmon.`);
  const trainerName = String(options.name || "").trim();
  if (!trainerName) throw new Error("Import requires --name for the receiving trainer.");
  const { createAgentInput, createSkillsMarkdown, ensureLineage } = await loadEngine();
  const role = options.role || "builder";
  if (!VALID_ROLES.has(role)) throw new Error(`Unknown role: ${role}`);
  const defaults = createAgentInput(role);
  const receivedAt = new Date().toISOString();
  const creature = unsignedPackage.creature;
  const priorLineage = ensureLineage({ ...creature, trainedAt: unsignedPackage.exportedAt });
  const lineage = {
    ...priorLineage,
    currentTrainer: trainerName,
    events: [...priorLineage.events, { type: "transfer", at: receivedAt, trainer: trainerName, fromTrainer: priorLineage.currentTrainer, fromDNA: priorLineage.currentDNA, toDNA: priorLineage.currentDNA }],
  };
  const agentmon = {
    ...creature,
    dna: priorLineage.currentDNA,
    trainerName,
    trainedAt: receivedAt,
    lineage,
    skillTree: {
      inheritedSkills: creature.learnedSkills || [],
      acquiredSkills: [],
      fusionMoves: [],
      inheritedLoops: creature.loops || [],
      acquiredLoops: [],
    },
    sourceCount: 0,
    trainingBytes: 0,
    ownership: { status: "unverified-copy", ownerName: trainerName, acquiredAt: receivedAt },
  };
  const config = {
    ...defaults,
    name: trainerName,
    provider: options.provider || creature.provider || defaults.provider,
    model: options.model || creature.model || defaults.model,
    mission: options.mission || creature.mission || defaults.mission,
    role,
    consent: "user_prompts_only",
  };
  const ledger = {
    format: "agentmon.learning-ledger/v1",
    updatedAt: receivedAt,
    entries: [{ engineVersion: ENGINE_VERSION, event: "transfer-in", observedAt: receivedAt, source: { packageIntegrity: tradePackage.integrity.digest, rawPromptTextStored: false }, lineage: { fromTrainer: priorLineage.currentTrainer, toTrainer: trainerName, genesisDNA: lineage.genesisDNA, currentDNA: lineage.currentDNA } }],
  };
  await writeJson(paths.config, config);
  await writeJson(paths.state, agentmon);
  await writeJson(paths.promptprint, { format: "agentmon.promptprint/v2", agentmonId: agentmon.id, derivedFrom: { promptCount: 0, rawPromptTextStored: false }, hatch: agentmon.promptprint, growth: growthProfile(agentmon), updatedAt: receivedAt });
  await atomicWrite(paths.skill, createSkillsMarkdown(agentmon));
  await writeJson(paths.ledger, ledger);
  await updateSquad(paths.squad, slot, agentmon, role, paths.state, rootDir);
  await persistAgentmonSnapshot(rootDir, {
    slot,
    agentmon,
    role,
    eventType: "transfer-in",
    occurredAt: receivedAt,
    eventPayload: ledger.entries[0],
    idempotencyKey: `transfer-in:${agentmon.id}:${tradePackage.integrity.digest}:${trainerName}`,
  });
  return { changed: true, action: "imported", slot, agentmon, paths, integrity: tradePackage.integrity.digest };
}

export async function issueSignedTransfer(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const slot = safeSlot(options.slot);
  const paths = pathsFor(rootDir, slot);
  const identity = await loadTrainerIdentity(rootDir);
  const state = await readAgentmonState(rootDir, slot);
  if (!state) throw new Error(`No Agentmon in slot '${slot}'.`);
  if (state.ownership?.status === "pending-transfer") throw new Error(`Agentmon already has pending transfer ${state.ownership.pendingTransfer?.certificateId || "unknown"}. Cancel it before issuing another.`);
  if (state.ownership?.status === "unverified-copy") throw new Error("An unverified copy cannot issue a canonical whole-Agentmon transfer.");
  const lineage = state.lineage;
  if (!lineage) throw new Error("Train this Agentmon once to initialize lineage before transfer.");
  if (identity.name !== lineage.currentTrainer) throw new Error(`Trainer identity ${identity.name} does not own lineage held by ${lineage.currentTrainer}.`);
  if (state.ownership?.ownerFingerprint && state.ownership.ownerFingerprint !== identity.fingerprint) throw new Error("Trainer key does not match the Agentmon ownership record.");
  const ownership = { status: state.ownership?.status === "verified-transfer" ? "verified-transfer" : "origin", ownerName: identity.name, ownerFingerprint: identity.fingerprint, certificateId: state.ownership?.certificateId, acquiredAt: state.ownership?.acquiredAt || new Date().toISOString(), transferSequence: Math.max(0, Number(state.ownership?.transferSequence) || 0) };
  const ownedState = { ...state, ownership };
  const { createTradePackage } = await loadEngine();
  const sealed = sealTradePackage(createTradePackage(ownedState));
  const privateKey = await readFile(paths.privateKey, "utf8");
  const bundle = createSignedTransfer(sealed, identity, privateKey, options.to);
  const pendingState = {
    ...ownedState,
    ownership: {
      ...ownership,
      status: "pending-transfer",
      transferSequence: bundle.certificate.sequence,
      pendingTransfer: {
        certificateId: bundle.certificate.certificateId,
        toFingerprint: bundle.certificate.toFingerprint,
        issuedAt: bundle.certificate.issuedAt,
        expiresAt: bundle.certificate.expiresAt,
        priorStatus: ownership.status,
      },
    },
  };
  const output = options.out || resolve(rootDir, ".agentmon/transfers", `${slot}-${state.id}-to-${bundle.certificate.toFingerprint.slice(0, 12)}.agentmon-transfer.json`);
  await writeJson(paths.state, pendingState);
  await writeJson(output, bundle);
  await persistAgentmonSnapshot(rootDir, {
    slot,
    agentmon: pendingState,
    role: (await readJson(paths.config, {})).role || "builder",
    eventType: "transfer-issued",
    occurredAt: bundle.certificate.issuedAt,
    eventPayload: {
      certificateId: bundle.certificate.certificateId,
      toFingerprint: bundle.certificate.toFingerprint,
      payloadDigest: bundle.certificate.payloadDigest,
      rawPromptTextStored: false,
    },
    idempotencyKey: `transfer-issued:${bundle.certificate.certificateId}`,
  });
  await updateOwnershipRegistry(rootDir, { creatureId: state.id, genesisDNA: lineage.genesisDNA, currentDNA: lineage.currentDNA, ownerName: identity.name, ownerFingerprint: identity.fingerprint, status: "transfer-issued", certificateId: bundle.certificate.certificateId, counterpartyFingerprint: bundle.certificate.toFingerprint, sequence: bundle.certificate.sequence, expiresAt: bundle.certificate.expiresAt, manifestDigest: bundle.certificate.manifestDigest, updatedAt: bundle.certificate.issuedAt });
  return { bundle, output, agentmon: pendingState, paths };
}

export async function acceptSignedTransfer(bundle, options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const identity = await loadTrainerIdentity(rootDir);
  const { unsignedPackage, certificate } = verifySignedTransfer(bundle, identity);
  const registry = await readJson(pathsFor(rootDir, "main").registry, { entries: [] });
  if (registry.entries.some((entry) => entry.certificateId === certificate.certificateId)) throw new Error("Transfer certificate has already been accepted in this registry.");
  const owner = unsignedPackage.creature.ownership;
  if (owner?.ownerFingerprint !== certificate.from.fingerprint || owner?.ownerName !== certificate.from.name) throw new Error("Transfer signer does not match the packaged ownership record.");
  const imported = await importAgentmonPackage(bundle.tradePackage, { ...options, rootDir, name: identity.name });
  const acquiredAt = new Date().toISOString();
  const ownership = { status: "verified-transfer", ownerName: identity.name, ownerFingerprint: identity.fingerprint, certificateId: certificate.certificateId, acquiredAt, transferSequence: Number(certificate.sequence) || 1 };
  const agentmon = { ...imported.agentmon, ownership };
  await writeJson(imported.paths.state, agentmon);
  const ledger = await readJson(imported.paths.ledger);
  ledger.entries.push({ engineVersion: ENGINE_VERSION, event: "ownership-accepted", observedAt: acquiredAt, source: { rawPromptTextStored: false }, ownership: { certificateId: certificate.certificateId, fromFingerprint: certificate.from.fingerprint, toFingerprint: identity.fingerprint } });
  ledger.updatedAt = acquiredAt;
  await writeJson(imported.paths.ledger, ledger);
  await persistAgentmonSnapshot(rootDir, {
    slot: imported.slot,
    agentmon,
    role: (await readJson(imported.paths.config, {})).role || "builder",
    eventType: "ownership-accepted",
    occurredAt: acquiredAt,
    eventPayload: ledger.entries.at(-1),
    idempotencyKey: `ownership-accepted:${certificate.certificateId}`,
  });
  await updateOwnershipRegistry(rootDir, { creatureId: agentmon.id, genesisDNA: agentmon.lineage.genesisDNA, currentDNA: agentmon.lineage.currentDNA, ownerName: identity.name, ownerFingerprint: identity.fingerprint, status: "verified-owner", certificateId: certificate.certificateId, counterpartyFingerprint: certificate.from.fingerprint, sequence: Number(certificate.sequence) || 1, parentCertificateId: certificate.parentCertificateId || null, manifestDigest: certificate.manifestDigest || null, updatedAt: acquiredAt });
  return { ...imported, action: "accepted", agentmon, certificate };
}

export async function cancelSignedTransfer(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const slot = safeSlot(options.slot);
  const paths = pathsFor(rootDir, slot);
  const identity = await loadTrainerIdentity(rootDir);
  const state = await readAgentmonState(rootDir, slot);
  if (!state) throw new Error(`No Agentmon in slot '${slot}'.`);
  const pending = state.ownership?.pendingTransfer;
  if (state.ownership?.status !== "pending-transfer" || !pending) throw new Error("Agentmon has no pending transfer to cancel.");
  if (options.certificate && options.certificate !== pending.certificateId) throw new Error("Pending transfer certificate does not match --certificate.");
  if (state.ownership.ownerFingerprint !== identity.fingerprint || state.ownership.ownerName !== identity.name) throw new Error("Trainer identity does not match the pending ownership head.");
  const cancelledAt = new Date().toISOString();
  const ownership = { ...state.ownership, status: pending.priorStatus, pendingTransfer: undefined };
  const agentmon = { ...state, ownership };
  await writeJson(paths.state, agentmon);
  await persistAgentmonSnapshot(rootDir, {
    slot,
    agentmon,
    role: (await readJson(paths.config, {})).role || "builder",
    eventType: "transfer-cancelled",
    occurredAt: cancelledAt,
    eventPayload: { certificateId: pending.certificateId, toFingerprint: pending.toFingerprint, rawPromptTextStored: false },
    idempotencyKey: `transfer-cancelled:${pending.certificateId}`,
  });
  await updateOwnershipRegistry(rootDir, { creatureId: agentmon.id, genesisDNA: agentmon.lineage.genesisDNA, currentDNA: agentmon.lineage.currentDNA, ownerName: identity.name, ownerFingerprint: identity.fingerprint, status: "transfer-cancelled", certificateId: pending.certificateId, counterpartyFingerprint: pending.toFingerprint, sequence: ownership.transferSequence, updatedAt: cancelledAt });
  return { agentmon, certificateId: pending.certificateId, cancelledAt };
}

export async function importAgentmon(args) {
  if (!args.file) throw new Error("Import requires --file TRADE.json.");
  const tradePackage = await readJson(args.file);
  if (!tradePackage) throw new Error(`Trade package not found: ${args.file}`);
  const result = await importAgentmonPackage(tradePackage, args);
  process.stdout.write(`${formatCard(result)}\nImported from ${result.agentmon.lineage.originTrainer} to ${result.agentmon.lineage.currentTrainer}. Train this slot to unlock cross-trainer fusions.\n`);
}

export async function showIdentity(args) {
  const identity = await createTrainerIdentity(args);
  process.stdout.write(`${identity.name}\nFingerprint: ${identity.fingerprint}\nPrivate key: ${identity.paths.privateKey}\n`);
}

export async function transferSlot(args) {
  if (!args.to) throw new Error("Transfer requires --to RECIPIENT_FINGERPRINT.");
  const result = await issueSignedTransfer(args);
  process.stdout.write(`Signed whole-Agentmon transfer issued: ${result.output}\nCertificate: ${result.bundle.certificate.certificateId} · sequence ${result.bundle.certificate.sequence}\nRecipient: ${result.bundle.certificate.toFingerprint}\nExpires: ${result.bundle.certificate.expiresAt}\nCreature frozen pending acceptance or cancellation.\n`);
}

export async function cancelTransfer(args) {
  if (!args.certificate) throw new Error("Transfer cancellation requires --certificate CERTIFICATE_ID.");
  const result = await cancelSignedTransfer(args);
  process.stdout.write(`Pending whole-Agentmon transfer cancelled: ${result.certificateId}\nOwnership restored to ${result.agentmon.ownership.ownerName}.\n`);
}

export async function acceptTransfer(args) {
  if (!args.file) throw new Error("Accept requires --file TRANSFER.json.");
  const bundle = await readJson(args.file);
  if (!bundle) throw new Error(`Transfer bundle not found: ${args.file}`);
  const result = await acceptSignedTransfer(bundle, args);
  process.stdout.write(`${formatCard(result)}\nVerified ownership accepted from ${result.certificate.from.name}. Certificate ${result.certificate.certificateId}.\n`);
}

export async function showRegistry(args) {
  const registry = await readJson(pathsFor(args.rootDir, "main").registry, { entries: [] });
  if (!registry.entries.length) { process.stdout.write("Ownership registry is empty.\n"); return; }
  for (const entry of registry.entries) process.stdout.write(`${entry.creatureId}\t${entry.status}\t${entry.ownerName}\t${entry.ownerFingerprint.slice(0, 16)}…\t${entry.certificateId}\n`);
}

export async function evolveAgentmonSlot(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const slot = safeSlot(options.slot);
  const paths = pathsFor(rootDir, slot);
  const state = await readAgentmonState(rootDir, slot);
  if (!state) throw new Error(`No Agentmon in slot '${slot}'.`);
  if (state.ownership?.status === "pending-transfer") throw new Error("A pending whole-Agentmon transfer freezes evolution until it is accepted, expired, or cancelled.");
  if (state.lineage?.currentTrainer !== state.lineage?.originTrainer && state.ownership?.status !== "verified-transfer") throw new Error("Transferred evolution requires a verified signed ownership certificate.");
  const config = await readJson(paths.config);
  const ledger = await readJson(paths.ledger, { format: "agentmon.learning-ledger/v1", entries: [] });
  const { createSkillsMarkdown, evolveAgentmon } = await loadEngine();
  const evolved = evolveAgentmon(state);
  ledger.entries.push({ engineVersion: ENGINE_VERSION, event: "evolution", observedAt: evolved.trainedAt, source: { rawPromptTextStored: false }, lineage: evolved.lineage.events.at(-1) });
  ledger.updatedAt = evolved.trainedAt;
  await writeJson(paths.state, evolved);
  await atomicWrite(paths.skill, createSkillsMarkdown(evolved));
  await writeJson(paths.ledger, ledger);
  await updateSquad(paths.squad, slot, evolved, config?.role || "builder", paths.state, rootDir);
  await persistAgentmonSnapshot(rootDir, {
    slot,
    agentmon: evolved,
    role: config?.role || "builder",
    eventType: "evolution",
    occurredAt: evolved.trainedAt,
    eventPayload: ledger.entries.at(-1),
    idempotencyKey: `evolution:${evolved.id}:${evolved.lineage.currentDNA}`,
  });
  if (evolved.ownership?.ownerFingerprint) await updateOwnershipRegistry(rootDir, { creatureId: evolved.id, genesisDNA: evolved.lineage.genesisDNA, currentDNA: evolved.lineage.currentDNA, ownerName: evolved.ownership.ownerName, ownerFingerprint: evolved.ownership.ownerFingerprint, status: "verified-owner", certificateId: evolved.ownership.certificateId || "genesis", updatedAt: evolved.trainedAt });
  return { changed: true, action: "evolved", slot, agentmon: evolved, paths };
}
