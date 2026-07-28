import { createHash, createPublicKey, generateKeyPairSync, randomBytes, sign as signPayload, verify as verifySignature } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { persistOwnershipEvent, persistTrainerIdentity } from "../../scripts/agentmon-db.mjs";
import { atomicWrite, pathsFor, readJson, writeJson } from "../runtime/storage.mjs";

export function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const WHOLE_AGENTMON_SECTIONS = ["identity", "genome", "promptprint", "capabilities", "procedures", "proof", "lineage", "ownership"];

function tradePackageSections(creature) {
  return {
    identity: { id: creature.id, species: creature.species, form: creature.form || null, number: creature.number, trainerName: creature.trainerName, primaryType: creature.primaryType, secondaryType: creature.secondaryType },
    genome: { dna: creature.dna, traitKey: creature.traitKey, traits: creature.traits, nature: creature.nature, variant: creature.variant, coreGlyph: creature.coreGlyph, evolutionStage: creature.evolutionStage || 1 },
    promptprint: { hatch: creature.promptprint, growth: creature.growthPromptprint || null, nameForge: creature.nameForge || null, nameHistory: creature.nameHistory || [] },
    capabilities: { moves: creature.moves || [], learnedSkills: creature.learnedSkills || [], loops: creature.loops || [], combinations: creature.combinations || [], skillTree: creature.skillTree || null, skillPackages: creature.skillPackages || [] },
    procedures: { proceduralSkills: creature.proceduralSkills || [], behaviorHypotheses: creature.behaviorHypotheses || [], skillCandidates: creature.skillCandidates || [] },
    proof: { procedureTrials: creature.procedureTrials || [], arenaReport: creature.arenaReport || null, hatchReadiness: creature.hatchReadiness || null },
    lineage: creature.lineage || null,
    ownership: creature.ownership || null,
  };
}

function publicKeyFingerprint(publicKeyPem) {
  const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex").toUpperCase();
}

export async function createTrainerIdentity(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const paths = pathsFor(rootDir, "main");
  const existing = await readJson(paths.identityMeta);
  if (existing) {
    if (options.name && existing.name !== String(options.name).trim()) throw new Error(`Trainer identity already belongs to ${existing.name}.`);
    const identity = { ...existing, publicKey: await readFile(paths.publicKey, "utf8"), paths };
    await persistTrainerIdentity(rootDir, identity);
    return identity;
  }
  const name = String(options.name || "").trim();
  if (!name) throw new Error("Identity creation requires --name.");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const identity = { format: "agentmon.trainer/v1", name, fingerprint: publicKeyFingerprint(publicKey), createdAt: new Date().toISOString() };
  await atomicWrite(paths.privateKey, privateKey);
  await atomicWrite(paths.publicKey, publicKey);
  await writeJson(paths.identityMeta, identity);
  await persistTrainerIdentity(rootDir, { ...identity, publicKey });
  return { ...identity, publicKey, paths };
}

export async function loadTrainerIdentity(rootDir) {
  const paths = pathsFor(rootDir, "main");
  const identity = await readJson(paths.identityMeta);
  if (!identity) throw new Error("No trainer identity found. Run `agentmon identity --name NAME` first.");
  const publicKey = await readFile(paths.publicKey, "utf8");
  if (identity.fingerprint !== publicKeyFingerprint(publicKey)) throw new Error("Trainer public key does not match its fingerprint.");
  return { ...identity, publicKey, paths };
}

export async function updateOwnershipRegistry(rootDir, record) {
  const path = pathsFor(rootDir, "main").registry;
  const registry = await readJson(path, { format: "agentmon.ownership-registry/v1", updatedAt: null, entries: [] });
  registry.entries = [...registry.entries.filter((entry) => !(entry.creatureId === record.creatureId && entry.certificateId === record.certificateId)), record];
  registry.updatedAt = new Date().toISOString();
  await writeJson(path, registry);
  await persistOwnershipEvent(rootDir, record);
  return registry;
}

export function sealTradePackage(unsignedPackage) {
  let packageBody = unsignedPackage;
  if (unsignedPackage?.format === "agentmon.trade/v3") {
    const sections = tradePackageSections(unsignedPackage.creature);
    const sectionDigests = Object.fromEntries(WHOLE_AGENTMON_SECTIONS.map((section) => [section, sha256(sections[section])]));
    const manifestBase = { ...unsignedPackage.manifest, sectionDigests };
    delete manifestBase.manifestDigest;
    packageBody = { ...unsignedPackage, manifest: { ...manifestBase, manifestDigest: sha256(manifestBase) } };
  }
  return { ...packageBody, integrity: { algorithm: "sha256", digest: sha256(packageBody) } };
}

export function verifyTradePackage(tradePackage) {
  if (!["agentmon.trade/v2", "agentmon.trade/v3"].includes(tradePackage?.format)) throw new Error("Only agentmon.trade/v2 or agentmon.trade/v3 packages can be imported.");
  if (tradePackage.privacy?.rawPromptsIncluded !== false || tradePackage.privacy?.credentialsIncluded !== false || tradePackage.privacy?.skillPackageContentsIncluded !== false) {
    throw new Error("Trade package does not satisfy the raw-free privacy boundary.");
  }
  const { integrity, ...unsignedPackage } = tradePackage;
  if (integrity?.algorithm !== "sha256" || integrity.digest !== sha256(unsignedPackage)) throw new Error("Trade package integrity check failed.");
  if (!unsignedPackage.creature?.id || !unsignedPackage.creature?.lineage?.genesisDNA) throw new Error("Trade package is missing creature lineage.");
  if (unsignedPackage.format === "agentmon.trade/v3") {
    const manifest = unsignedPackage.manifest;
    if (manifest?.mode !== "whole-agentmon") throw new Error("Trade package is not a whole-Agentmon transfer.");
    if (WHOLE_AGENTMON_SECTIONS.some((section) => !manifest.includedSections?.includes(section))) throw new Error("Whole-Agentmon manifest is missing a required section.");
    if (manifest.creatureId !== unsignedPackage.creature.id || manifest.genesisDNA !== unsignedPackage.creature.lineage.genesisDNA || manifest.currentDNA !== unsignedPackage.creature.lineage.currentDNA || manifest.generation !== unsignedPackage.creature.lineage.generation) {
      throw new Error("Whole-Agentmon manifest does not match creature identity or lineage.");
    }
    const sections = tradePackageSections(unsignedPackage.creature);
    for (const section of WHOLE_AGENTMON_SECTIONS) {
      if (manifest.sectionDigests?.[section] !== sha256(sections[section])) throw new Error(`Whole-Agentmon section integrity failed: ${section}.`);
    }
    const manifestBase = { ...manifest };
    delete manifestBase.manifestDigest;
    if (manifest.manifestDigest !== sha256(manifestBase)) throw new Error("Whole-Agentmon manifest integrity failed.");
  }
  return unsignedPackage;
}

export function createSignedTransfer(tradePackage, sender, privateKeyPem, recipientFingerprint, options = {}) {
  const unsignedPackage = verifyTradePackage(tradePackage);
  const toFingerprint = String(recipientFingerprint || "").trim().toUpperCase();
  if (!/^[A-F0-9]{64}$/.test(toFingerprint)) throw new Error("Recipient fingerprint must be 64 hexadecimal characters.");
  if (sender.fingerprint !== publicKeyFingerprint(sender.publicKey)) throw new Error("Sender identity fingerprint is invalid.");
  const issuedAt = new Date(options.issuedAt || Date.now()).toISOString();
  const expiresAt = new Date(options.expiresAt || Date.parse(issuedAt) + 7 * 24 * 60 * 60 * 1000).toISOString();
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) throw new Error("Transfer expiry must be after issuance.");
  const owner = unsignedPackage.creature.ownership || {};
  const sequence = Math.max(0, Number(owner.transferSequence) || 0) + 1;
  const parentCertificateId = owner.certificateId || "genesis";
  const base = {
    format: "agentmon.transfer-certificate/v2",
    transferMode: "whole-agentmon",
    packageFormat: unsignedPackage.format,
    creatureId: unsignedPackage.creature.id,
    genesisDNA: unsignedPackage.creature.lineage.genesisDNA,
    currentDNA: unsignedPackage.creature.lineage.currentDNA,
    generation: unsignedPackage.creature.lineage.generation,
    payloadDigest: tradePackage.integrity.digest,
    manifestDigest: unsignedPackage.manifest?.manifestDigest || null,
    parentCertificateId,
    sequence,
    from: { name: sender.name, fingerprint: sender.fingerprint, publicKey: sender.publicKey },
    toFingerprint,
    issuedAt,
    expiresAt,
    nonce: randomBytes(16).toString("hex"),
  };
  const ownershipHeadDigest = sha256({ creatureId: base.creatureId, currentDNA: base.currentDNA, ownerFingerprint: sender.fingerprint, parentCertificateId, sequence });
  const certificateBody = { ...base, ownershipHeadDigest, certificateId: sha256({ ...base, ownershipHeadDigest }).slice(0, 32).toUpperCase() };
  const signature = signPayload(null, Buffer.from(JSON.stringify(certificateBody)), privateKeyPem).toString("base64");
  return { format: "agentmon.transfer/v2", tradePackage, certificate: { ...certificateBody, signature } };
}

export function verifySignedTransfer(bundle, recipientIdentity) {
  if (!["agentmon.transfer/v1", "agentmon.transfer/v2"].includes(bundle?.format) || !bundle.certificate || !bundle.tradePackage) throw new Error("Invalid signed transfer bundle.");
  const unsignedPackage = verifyTradePackage(bundle.tradePackage);
  const { signature, ...certificateBody } = bundle.certificate;
  const senderFingerprint = publicKeyFingerprint(certificateBody.from?.publicKey || "");
  if (senderFingerprint !== certificateBody.from?.fingerprint) throw new Error("Transfer sender fingerprint is invalid.");
  if (!verifySignature(null, Buffer.from(JSON.stringify(certificateBody)), certificateBody.from.publicKey, Buffer.from(signature || "", "base64"))) throw new Error("Transfer signature verification failed.");
  if (certificateBody.toFingerprint !== recipientIdentity.fingerprint) throw new Error("Transfer was issued to a different recipient fingerprint.");
  if (certificateBody.payloadDigest !== bundle.tradePackage.integrity.digest) throw new Error("Transfer certificate does not match its trade payload.");
  if (certificateBody.creatureId !== unsignedPackage.creature.id || certificateBody.genesisDNA !== unsignedPackage.creature.lineage.genesisDNA || certificateBody.currentDNA !== unsignedPackage.creature.lineage.currentDNA) throw new Error("Transfer certificate creature lineage does not match its payload.");
  if (bundle.format === "agentmon.transfer/v2") {
    if (certificateBody.format !== "agentmon.transfer-certificate/v2" || certificateBody.transferMode !== "whole-agentmon" || certificateBody.packageFormat !== "agentmon.trade/v3") throw new Error("Transfer is not a whole-Agentmon v2 certificate.");
    if (Date.parse(certificateBody.expiresAt) <= Date.now()) throw new Error("Transfer certificate has expired.");
    if (!Number.isInteger(certificateBody.sequence) || certificateBody.sequence < 1) throw new Error("Transfer certificate sequence is invalid.");
    const owner = unsignedPackage.creature.ownership || {};
    if (certificateBody.parentCertificateId !== (owner.certificateId || "genesis") || certificateBody.sequence !== Math.max(0, Number(owner.transferSequence) || 0) + 1) throw new Error("Transfer certificate does not extend the packaged ownership head.");
    if (certificateBody.manifestDigest !== unsignedPackage.manifest?.manifestDigest) throw new Error("Transfer certificate does not match the whole-Agentmon manifest.");
    const expectedHead = sha256({ creatureId: certificateBody.creatureId, currentDNA: certificateBody.currentDNA, ownerFingerprint: senderFingerprint, parentCertificateId: certificateBody.parentCertificateId, sequence: certificateBody.sequence });
    if (certificateBody.ownershipHeadDigest !== expectedHead) throw new Error("Transfer ownership head is invalid.");
  }
  return { unsignedPackage, certificate: bundle.certificate };
}
