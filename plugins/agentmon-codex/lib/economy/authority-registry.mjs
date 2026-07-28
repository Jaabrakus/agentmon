import { createHash, createPublicKey, generateKeyPairSync, randomBytes, randomUUID, sign, verify } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isCanonicalRecipeProcedure } from "../agentmon-engine.mjs";
import { verifyEngineInduction } from "../semantics/semantic-induction.mjs";
import { buildAgentmonStateCommitment, inspectEconomyEligibility } from "./verified-economy.mjs";

const AUTHORITY_FORMAT = "agentmon.economy-authority/v1";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

async function readJson(path, fallback = null) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try { await writeFile(temporary, content, { mode: 0o600 }); await rename(temporary, path); }
  catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}

async function writeJson(path, value) {
  await atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`);
}

function fingerprint(publicKey) {
  const der = createPublicKey(publicKey).export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex").toUpperCase();
}

export function assertFingerprint(value, label = "Fingerprint") {
  const normalized = String(value || "").trim().toUpperCase();
  if (!/^[A-F0-9]{64}$/.test(normalized)) throw new Error(`${label} must be 64 hexadecimal characters.`);
  return normalized;
}

function pathsFor(rootDir) {
  const root = resolve(rootDir);
  return {
    root,
    db: resolve(root, "registry.db"),
    meta: resolve(root, "authority.json"),
    privateKey: resolve(root, "authority-private-key.pem"),
    publicKey: resolve(root, "authority-public-key.pem"),
  };
}

export function openAuthorityRegistry(rootDir) {
  const paths = pathsFor(rootDir);
  mkdirSync(paths.root, { recursive: true });
  const db = new DatabaseSync(paths.db);
  chmodSync(paths.db, 0o600);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS creatures (
      agentmon_id TEXT PRIMARY KEY,
      genesis_dna TEXT NOT NULL,
      state_root TEXT NOT NULL,
      owner_fingerprint TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      transition_sequence INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK(status IN ('active', 'revoked')),
      certificate_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      agentmon_id TEXT NOT NULL REFERENCES creatures(agentmon_id),
      state_root TEXT NOT NULL,
      owner_fingerprint TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active', 'consumed', 'cancelled', 'expired')),
      expires_at TEXT NOT NULL,
      certificate_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_listing_per_agentmon ON listings(agentmon_id) WHERE status = 'active';
    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL UNIQUE REFERENCES listings(id),
      agentmon_id TEXT NOT NULL REFERENCES creatures(agentmon_id),
      from_fingerprint TEXT NOT NULL,
      to_fingerprint TEXT NOT NULL,
      prior_sequence INTEGER NOT NULL,
      sequence INTEGER NOT NULL,
      state_root TEXT NOT NULL,
      certificate_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transition_attestations (
      id TEXT PRIMARY KEY,
      agentmon_id TEXT NOT NULL REFERENCES creatures(agentmon_id),
      parent_state_root TEXT NOT NULL,
      child_state_root TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      certificate_json TEXT NOT NULL,
      consumed_by TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS state_transitions (
      id TEXT PRIMARY KEY,
      agentmon_id TEXT NOT NULL REFERENCES creatures(agentmon_id),
      kind TEXT NOT NULL CHECK(kind IN ('learning', 'evolution')),
      parent_state_root TEXT NOT NULL,
      child_state_root TEXT NOT NULL,
      transition_sequence INTEGER NOT NULL,
      ownership_sequence INTEGER NOT NULL,
      request_digest TEXT NOT NULL,
      certificate_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(agentmon_id, parent_state_root),
      UNIQUE(agentmon_id, child_state_root)
    );
  `);
  const creatureColumns = new Set(db.prepare("PRAGMA table_info(creatures)").all().map((column) => column.name));
  if (!creatureColumns.has("transition_sequence")) db.exec("ALTER TABLE creatures ADD COLUMN transition_sequence INTEGER NOT NULL DEFAULT 0");
  return { db, paths };
}

export async function loadAuthority(rootDir) {
  const paths = pathsFor(rootDir);
  const meta = await readJson(paths.meta);
  if (!meta) throw new Error("Economy authority is not initialized.");
  const [privateKey, publicKey] = await Promise.all([readFile(paths.privateKey, "utf8"), readFile(paths.publicKey, "utf8")]);
  if (meta.fingerprint !== fingerprint(publicKey)) throw new Error("Authority public key does not match its fingerprint.");
  return { ...meta, privateKey, publicKey, paths };
}

export function signCertificate(body, authority) {
  const signature = sign(null, Buffer.from(canonicalJson(body)), authority.privateKey).toString("base64");
  return { ...body, issuer: { name: authority.name, fingerprint: authority.fingerprint, publicKey: authority.publicKey }, signature };
}

export function verifyAuthorityCertificate(certificate) {
  if (!certificate?.issuer?.publicKey || !certificate.signature) throw new Error("Authority certificate is incomplete.");
  if (fingerprint(certificate.issuer.publicKey) !== certificate.issuer.fingerprint) throw new Error("Authority fingerprint is invalid.");
  const { signature, issuer, ...body } = certificate;
  if (!verify(null, Buffer.from(canonicalJson(body)), issuer.publicKey, Buffer.from(signature, "base64"))) throw new Error("Authority certificate signature is invalid.");
  return body;
}

export async function initializeAuthorityRegistry(rootDir, options = {}) {
  const paths = pathsFor(rootDir);
  const existing = await readJson(paths.meta);
  if (existing) return { ...existing, paths };
  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const meta = {
    format: AUTHORITY_FORMAT,
    name: String(options.name || "Agentmon Development Registry").trim(),
    fingerprint: fingerprint(publicKey),
    createdAt: new Date().toISOString(),
  };
  await atomicWrite(paths.privateKey, privateKey);
  await atomicWrite(paths.publicKey, publicKey);
  chmodSync(paths.privateKey, 0o600);
  await writeJson(paths.meta, meta);
  const store = openAuthorityRegistry(rootDir);
  store.db.close();
  return { ...meta, paths };
}

export async function certifyCanonicalAgentmon(rootDir, input) {
  const authority = await loadAuthority(rootDir);
  const ownerFingerprint = assertFingerprint(input.ownerFingerprint, "Owner fingerprint");
  const eligibility = inspectEconomyEligibility(input.agentmon);
  if (!eligibility.eligible) throw new Error(`Modded Agentmon cannot be certified: ${eligibility.taints.join(", ")}`);
  const forgedProcedure = (input.agentmon.proceduralSkills || []).find((procedure) => !isCanonicalRecipeProcedure(procedure) && !verifyEngineInduction(procedure));
  if (forgedProcedure) throw new Error(`Procedure ${forgedProcedure.id} does not match an authority-canonical engine derivation.`);
  const commitment = buildAgentmonStateCommitment(input.agentmon);
  if (input.verification?.stateRoot && input.verification.stateRoot !== commitment.stateRoot) throw new Error("Verification receipt does not match canonical state root.");
  if (input.verification && !input.verification.valid) throw new Error("Verification receipt is not valid.");
  const store = openAuthorityRegistry(rootDir);
  try {
    const prior = store.db.prepare("SELECT * FROM creatures WHERE agentmon_id = ?").get(input.agentmon.id);
    if (prior?.status === "revoked") throw new Error("Agentmon has been revoked by the authority.");
    if (prior && prior.owner_fingerprint !== ownerFingerprint) throw new Error("Only the registered owner may certify a new state root.");
    if (prior && prior.state_root !== commitment.stateRoot) throw new Error("State root changed. The certification endpoint cannot bless mutations; submit an authority-validated training or evolution transition.");
    const sequence = Number(prior?.sequence || 0);
    const issuedAt = new Date().toISOString();
    const body = {
      format: "agentmon.authority-state/v1",
      certificateId: randomUUID(),
      agentmonId: input.agentmon.id,
      genesisDNA: commitment.genesisDNA,
      stateRoot: commitment.stateRoot,
      ownerFingerprint,
      ownershipSequence: sequence,
      transitionSequence: Number(prior?.transition_sequence || 0),
      issuedAt,
      nonce: randomBytes(16).toString("hex"),
    };
    const certificate = signCertificate(body, authority);
    store.db.prepare(`INSERT INTO creatures(agentmon_id, genesis_dna, state_root, owner_fingerprint, sequence, transition_sequence, status, certificate_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
      ON CONFLICT(agentmon_id) DO UPDATE SET state_root = excluded.state_root, certificate_json = excluded.certificate_json, updated_at = excluded.updated_at`)
      .run(body.agentmonId, body.genesisDNA, body.stateRoot, ownerFingerprint, sequence, body.transitionSequence, JSON.stringify(certificate), issuedAt);
    return certificate;
  } finally { store.db.close(); }
}

export async function issueListingCertificate(rootDir, input) {
  const authority = await loadAuthority(rootDir);
  const ownerFingerprint = assertFingerprint(input.ownerFingerprint, "Owner fingerprint");
  const store = openAuthorityRegistry(rootDir);
  try {
    const creature = store.db.prepare("SELECT * FROM creatures WHERE agentmon_id = ?").get(input.agentmonId);
    if (!creature || creature.status !== "active") throw new Error("Agentmon has no active authority record.");
    if (creature.owner_fingerprint !== ownerFingerprint) throw new Error("Listing signer is not the registered owner.");
    if (creature.state_root !== input.stateRoot) throw new Error("Listing state root is stale or modified. Certify the current canonical state first.");
    const issuedAt = new Date().toISOString();
    const expiresAt = new Date(input.expiresAt || Date.now() + 24 * 60 * 60 * 1000).toISOString();
    if (Date.parse(expiresAt) <= Date.parse(issuedAt)) throw new Error("Listing expiry must be in the future.");
    const body = {
      format: "agentmon.listing-certificate/v1",
      listingId: randomUUID(),
      agentmonId: creature.agentmon_id,
      genesisDNA: creature.genesis_dna,
      stateRoot: creature.state_root,
      ownerFingerprint,
      ownershipSequence: Number(creature.sequence),
      issuedAt,
      expiresAt,
      nonce: randomBytes(16).toString("hex"),
    };
    const certificate = signCertificate(body, authority);
    store.db.prepare("INSERT INTO listings(id, agentmon_id, state_root, owner_fingerprint, status, expires_at, certificate_json, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)")
      .run(body.listingId, body.agentmonId, body.stateRoot, ownerFingerprint, expiresAt, JSON.stringify(certificate), issuedAt);
    return certificate;
  } finally { store.db.close(); }
}

export async function finalizeAuthorityTransfer(rootDir, input) {
  const authority = await loadAuthority(rootDir);
  const recipient = assertFingerprint(input.toFingerprint, "Recipient fingerprint");
  const store = openAuthorityRegistry(rootDir);
  try {
    store.db.exec("BEGIN IMMEDIATE");
    const listing = store.db.prepare("SELECT * FROM listings WHERE id = ?").get(input.listingId);
    if (!listing || listing.status !== "active") throw new Error("Listing is missing, consumed, or cancelled.");
    if (Date.parse(listing.expires_at) <= Date.now()) {
      store.db.prepare("UPDATE listings SET status = 'expired' WHERE id = ?").run(input.listingId);
      throw new Error("Listing certificate has expired.");
    }
    const creature = store.db.prepare("SELECT * FROM creatures WHERE agentmon_id = ?").get(listing.agentmon_id);
    const expectedSequence = Number(input.expectedSequence);
    if (!Number.isInteger(expectedSequence) || expectedSequence !== Number(creature.sequence)) throw new Error("Ownership sequence mismatch; possible replay or stale transfer.");
    if (creature.owner_fingerprint !== listing.owner_fingerprint || creature.state_root !== listing.state_root) throw new Error("Listing no longer matches the authoritative ownership head.");
    if (recipient === creature.owner_fingerprint) throw new Error("Recipient already owns this Agentmon.");
    const createdAt = new Date().toISOString();
    const body = {
      format: "agentmon.authority-transfer/v1",
      transferId: randomUUID(),
      listingId: listing.id,
      agentmonId: creature.agentmon_id,
      stateRoot: creature.state_root,
      fromFingerprint: creature.owner_fingerprint,
      toFingerprint: recipient,
      priorSequence: expectedSequence,
      sequence: expectedSequence + 1,
      createdAt,
      nonce: randomBytes(16).toString("hex"),
    };
    const certificate = signCertificate(body, authority);
    store.db.prepare("UPDATE creatures SET owner_fingerprint = ?, sequence = ?, certificate_json = ?, updated_at = ? WHERE agentmon_id = ? AND sequence = ?")
      .run(recipient, body.sequence, JSON.stringify(certificate), createdAt, body.agentmonId, expectedSequence);
    store.db.prepare("UPDATE listings SET status = 'consumed' WHERE id = ?").run(listing.id);
    store.db.prepare("INSERT INTO transfers(id, listing_id, agentmon_id, from_fingerprint, to_fingerprint, prior_sequence, sequence, state_root, certificate_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(body.transferId, listing.id, body.agentmonId, body.fromFingerprint, recipient, expectedSequence, body.sequence, body.stateRoot, JSON.stringify(certificate), createdAt);
    store.db.exec("COMMIT");
    return certificate;
  } catch (error) {
    try { store.db.exec("ROLLBACK"); } catch {}
    throw error;
  } finally { store.db.close(); }
}

export async function readAuthorityRecord(rootDir, agentmonId) {
  const store = openAuthorityRegistry(rootDir);
  try {
    const creature = store.db.prepare("SELECT * FROM creatures WHERE agentmon_id = ?").get(agentmonId);
    const listings = store.db.prepare("SELECT * FROM listings WHERE agentmon_id = ? ORDER BY created_at DESC").all(agentmonId);
    const transitions = store.db.prepare("SELECT * FROM state_transitions WHERE agentmon_id = ? ORDER BY transition_sequence").all(agentmonId);
    return { creature, listings, transitions };
  } finally { store.db.close(); }
}
