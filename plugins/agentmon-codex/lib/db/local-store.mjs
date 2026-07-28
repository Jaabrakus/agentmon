import { createHash, randomUUID, sign as signPayload } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { buildAgentmonStateCommitment, inspectEconomyEligibility } from "../economy/verified-economy.mjs";
import { scoreOutcome } from "../effectiveness/outcome-engine.mjs";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(MODULE_DIR, "../../db/migrations");
export const DATABASE_FORMAT = "agentmon.local-db/v1";

export function now() {
  return new Date().toISOString();
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}

function safeDerivedPayload(value) {
  if (Array.isArray(value)) return value.map(safeDerivedPayload);
  if (!value || typeof value !== "object") return value;
  const blocked = new Set(["content", "prompt", "prompts", "prompttext", "rawprompt", "rawprompttext", "assistanttext", "reasoning"]);
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !blocked.has(key.toLowerCase()))
    .map(([key, nested]) => [key, safeDerivedPayload(nested)]));
}

export async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export function withTransaction(db, operation) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function applyMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version)));
  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  for (const name of migrations) {
    const version = Number(name.match(/^(\d+)_/)[1]);
    if (applied.has(version)) continue;
    const sql = readFileSync(resolve(MIGRATIONS_DIR, name), "utf8");
    withTransaction(db, () => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)").run(version, name, now());
    });
  }
}

export function ensureProject(db, rootDir) {
  const existing = db.prepare("SELECT * FROM projects WHERE root_path = ?").get(rootDir);
  if (existing) return existing;
  const createdAt = now();
  const project = { id: randomUUID(), name: basename(rootDir) || "Agentmon Project", root_path: rootDir, created_at: createdAt, updated_at: createdAt };
  db.prepare("INSERT INTO projects(id, name, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(project.id, project.name, project.root_path, project.created_at, project.updated_at);
  const squadId = `squad-${project.id}`;
  db.prepare("INSERT INTO squads(id, project_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(squadId, project.id, `${project.name} Squad`, createdAt, createdAt);
  return project;
}

function identityPaths(rootDir) {
  return {
    meta: resolve(rootDir, ".agentmon/identity/trainer.json"),
    privateKey: resolve(rootDir, ".agentmon/identity/private-key.pem"),
    publicKey: resolve(rootDir, ".agentmon/identity/public-key.pem"),
  };
}

export function persistTrainer(db, identity) {
  if (!identity?.fingerprint || !identity?.publicKey) return null;
  const trainerId = `trainer-${identity.fingerprint.toLowerCase()}`;
  const deviceId = `device-${identity.fingerprint.toLowerCase()}`;
  const createdAt = identity.createdAt || now();
  db.prepare(`INSERT INTO trainers(id, name, fingerprint, public_key, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(fingerprint) DO UPDATE SET name = excluded.name, public_key = excluded.public_key`)
    .run(trainerId, identity.name, identity.fingerprint, identity.publicKey, createdAt);
  db.prepare(`INSERT INTO devices(id, trainer_id, fingerprint, label, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(fingerprint) DO UPDATE SET trainer_id = excluded.trainer_id`)
    .run(deviceId, trainerId, identity.fingerprint, "primary-device", createdAt);
  return { trainerId, deviceId };
}

function loadLocalSigner(rootDir, db) {
  const paths = identityPaths(rootDir);
  if (!existsSync(paths.meta) || !existsSync(paths.privateKey) || !existsSync(paths.publicKey)) return null;
  const identity = JSON.parse(readFileSync(paths.meta, "utf8"));
  identity.publicKey = readFileSync(paths.publicKey, "utf8");
  const persisted = persistTrainer(db, identity);
  return { ...identity, privateKey: readFileSync(paths.privateKey, "utf8"), deviceId: persisted.deviceId };
}

export function appendAgentmonEvent(db, rootDir, projectId, agentmonId, input) {
  const payload = safeDerivedPayload(input.payload || {});
  const payloadJson = canonicalJson(payload);
  const payloadDigest = sha256(payloadJson);
  const idempotencyKey = String(input.idempotencyKey || `${agentmonId}:${input.eventType}:${payloadDigest}`);
  const existing = db.prepare("SELECT id FROM agentmon_events WHERE idempotency_key = ?").get(idempotencyKey);
  if (existing) return existing.id;
  const sequence = Number(db.prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS value FROM agentmon_events WHERE agentmon_id = ?").get(agentmonId).value);
  const eventId = randomUUID();
  const createdAt = now();
  const occurredAt = input.occurredAt || createdAt;
  const signer = loadLocalSigner(rootDir, db);
  const envelopeBody = {
    format: "agentmon.event/v1",
    id: eventId,
    projectId,
    agentmonId,
    deviceId: signer?.deviceId || null,
    sequence,
    eventType: input.eventType,
    schemaVersion: 1,
    occurredAt,
    payloadDigest,
    payload,
    idempotencyKey,
  };
  const signature = signer
    ? signPayload(null, Buffer.from(canonicalJson(envelopeBody)), signer.privateKey).toString("base64")
    : null;
  const envelope = { ...envelopeBody, signature };
  db.prepare(`INSERT INTO agentmon_events(
      id, project_id, agentmon_id, device_id, sequence, event_type, schema_version,
      occurred_at, payload_json, payload_digest, signature, idempotency_key, sync_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'pending', ?)`)
    .run(eventId, projectId, agentmonId, signer?.deviceId || null, sequence, input.eventType, occurredAt, payloadJson, payloadDigest, signature, idempotencyKey, createdAt);
  db.prepare(`INSERT INTO sync_outbox(
      id, event_id, aggregate_type, aggregate_id, envelope_json, status, attempts, created_at
    ) VALUES (?, ?, 'agentmon', ?, ?, 'pending', 0, ?)`)
    .run(randomUUID(), eventId, agentmonId, canonicalJson(envelope), createdAt);
  return eventId;
}

function skillRows(agentmon) {
  const rows = [];
  const add = (skill, branch) => {
    if (!skill?.id) return;
    rows.push({
      id: sha256(`${agentmon.id}:${branch}:${skill.id}`).slice(0, 32),
      key: skill.id,
      name: skill.name || skill.id,
      branch,
      evidence: Number(skill.evidence) || 0,
      json: canonicalJson(skill),
    });
  };
  for (const skill of agentmon.learnedSkills || []) add(skill, "learned");
  for (const skill of agentmon.skillTree?.inheritedSkills || []) add(skill, "inherited");
  for (const skill of agentmon.skillTree?.acquiredSkills || []) add(skill, "acquired");
  for (const skill of agentmon.skillTree?.fusionMoves || []) add(skill, "fusion");
  return rows;
}

export function persistEconomySnapshot(db, agentmon, updatedAt) {
  const commitment = buildAgentmonStateCommitment(agentmon);
  const eligibility = inspectEconomyEligibility(agentmon);
  const previous = db.prepare("SELECT * FROM agentmon_economy_heads WHERE agentmon_id = ?").get(agentmon.id);
  const changed = !previous || previous.state_root !== commitment.stateRoot;
  const sequence = changed ? Number(previous?.sequence || 0) + 1 : Number(previous.sequence);
  const permanentlyTainted = ["modded", "revoked"].includes(previous?.status);
  const status = previous?.status === "revoked"
    ? "revoked"
    : permanentlyTainted || !eligibility.eligible
      ? "modded"
      : !changed && previous?.status === "verified" ? "verified" : "local-unverified";
  const priorTaints = previous ? JSON.parse(previous.taints_json || "[]") : [];
  const taints = [...new Set([...priorTaints, ...eligibility.taints])].sort();

  db.prepare("UPDATE procedure_revisions SET active = 0 WHERE agentmon_id = ?").run(agentmon.id);
  const insertRevision = db.prepare(`INSERT INTO procedure_revisions(
    agentmon_id, procedure_key, revision_digest, provenance_kind, evidence_root,
    content_digest, engine_version, active, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  ON CONFLICT(agentmon_id, revision_digest) DO UPDATE SET active = 1`);
  for (const revision of commitment.procedureRevisions) {
    insertRevision.run(agentmon.id, revision.procedureId, revision.revisionDigest, revision.provenanceKind, revision.evidenceRoot, revision.contentDigest, revision.engineVersion, updatedAt);
  }

  if (changed) {
    db.prepare(`INSERT INTO economy_state_commits(
      agentmon_id, sequence, state_root, parent_state_root, status, taints_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(agentmon.id, sequence, commitment.stateRoot, previous?.state_root || null, status, canonicalJson(taints), updatedAt);
  }
  db.prepare(`INSERT INTO agentmon_economy_heads(
    agentmon_id, sequence, state_root, status, taints_json, authority_fingerprint,
    authority_certificate_json, updated_at
  ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)
  ON CONFLICT(agentmon_id) DO UPDATE SET
    sequence = excluded.sequence, state_root = excluded.state_root, status = excluded.status,
    taints_json = excluded.taints_json,
    authority_fingerprint = agentmon_economy_heads.authority_fingerprint,
    authority_certificate_json = CASE WHEN agentmon_economy_heads.state_root = excluded.state_root THEN agentmon_economy_heads.authority_certificate_json ELSE NULL END,
    updated_at = excluded.updated_at`)
    .run(agentmon.id, sequence, commitment.stateRoot, status, canonicalJson(taints), updatedAt);
  return { ...commitment, status, taints, sequence };
}

export function persistSnapshot(db, rootDir, project, input) {
  const agentmon = input.agentmon;
  const lineage = agentmon.lineage || {};
  const createdAt = db.prepare("SELECT created_at FROM agentmons WHERE id = ?").get(agentmon.id)?.created_at || agentmon.trainedAt || now();
  const updatedAt = agentmon.trainedAt || now();
  db.prepare(`INSERT INTO agentmons(
      id, project_id, slot, species, form, role, genesis_dna, current_dna, generation,
      owner_name, owner_fingerprint, ownership_status, state_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      project_id = excluded.project_id, slot = excluded.slot, species = excluded.species,
      form = excluded.form, role = excluded.role, genesis_dna = excluded.genesis_dna,
      current_dna = excluded.current_dna, generation = excluded.generation,
      owner_name = excluded.owner_name, owner_fingerprint = excluded.owner_fingerprint,
      ownership_status = excluded.ownership_status, state_json = excluded.state_json,
      updated_at = excluded.updated_at`)
    .run(
      agentmon.id,
      project.id,
      input.slot,
      agentmon.species,
      agentmon.form || agentmon.species,
      input.role || "builder",
      lineage.genesisDNA || agentmon.dna,
      lineage.currentDNA || agentmon.dna,
      Number(lineage.generation) || 1,
      agentmon.ownership?.ownerName || agentmon.trainerName,
      agentmon.ownership?.ownerFingerprint || null,
      agentmon.ownership?.status || "unregistered",
      canonicalJson(agentmon),
      createdAt,
      updatedAt,
    );

  persistEconomySnapshot(db, agentmon, updatedAt);

  const squad = db.prepare("SELECT id FROM squads WHERE project_id = ?").get(project.id);
  db.prepare(`INSERT INTO squad_members(squad_id, agentmon_id, slot, role, joined_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(squad_id, agentmon_id) DO UPDATE SET
      slot = excluded.slot, role = excluded.role, updated_at = excluded.updated_at`)
    .run(squad.id, agentmon.id, input.slot, input.role || "builder", createdAt, updatedAt);

  db.prepare("DELETE FROM skills WHERE agentmon_id = ?").run(agentmon.id);
  const insertSkill = db.prepare(`INSERT INTO skills(id, agentmon_id, skill_key, name, branch, evidence, skill_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const skill of skillRows(agentmon)) {
    insertSkill.run(skill.id, agentmon.id, skill.key, skill.name, skill.branch, skill.evidence, skill.json, updatedAt);
  }

  db.prepare("DELETE FROM prompt_observations WHERE agentmon_id = ?").run(agentmon.id);
  const insertObservation = db.prepare(`INSERT INTO prompt_observations(
    id, agentmon_id, source_id, digest, intent, confidence, learning_weight, signals_json, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const observation of agentmon.observations || []) {
    insertObservation.run(
      sha256(`${agentmon.id}:observation:${observation.sourceId}`).slice(0, 32),
      agentmon.id,
      observation.sourceId,
      observation.digest,
      observation.intent,
      Number(observation.confidence) || 0,
      Number(observation.learningWeight) || 0,
      canonicalJson(observation.signals || []),
      updatedAt,
    );
  }

  db.prepare("DELETE FROM decision_episodes WHERE agentmon_id = ?").run(agentmon.id);
  const insertEpisode = db.prepare(`INSERT INTO decision_episodes(
    id, agentmon_id, source_id, digest, predicted_intent, engine_intent, confidence,
    resolution_status, corrected_intent, context_json, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const episode of agentmon.decisionEpisodes || []) {
    insertEpisode.run(
      sha256(`${agentmon.id}:episode:${episode.sourceId}`).slice(0, 32),
      agentmon.id,
      episode.sourceId,
      episode.digest,
      episode.prediction.intent,
      episode.prediction.engineIntent,
      Number(episode.prediction.confidence) || 0,
      episode.resolution.status,
      episode.resolution.correctedIntent || null,
      canonicalJson(episode.context),
      updatedAt,
    );
  }

  db.prepare("DELETE FROM behavior_hypotheses WHERE agentmon_id = ?").run(agentmon.id);
  const insertHypothesis = db.prepare(`INSERT INTO behavior_hypotheses(
    id, agentmon_id, skill_key, status, confidence, evidence_for_count,
    evidence_against_count, hypothesis_json, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const hypothesis of agentmon.behaviorHypotheses || []) {
    insertHypothesis.run(
      sha256(`${agentmon.id}:hypothesis:${hypothesis.id}`).slice(0, 32),
      agentmon.id,
      hypothesis.id,
      hypothesis.status,
      Number(hypothesis.confidence) || 0,
      hypothesis.evidenceFor?.length || 0,
      hypothesis.evidenceAgainst?.length || 0,
      canonicalJson(hypothesis),
      updatedAt,
    );
  }

  db.prepare("DELETE FROM skill_candidates WHERE agentmon_id = ?").run(agentmon.id);
  const insertCandidate = db.prepare(`INSERT INTO skill_candidates(
    id, agentmon_id, skill_key, name, stage, confidence, evidence_count,
    behavioral_evidence_count, weighted_evidence, candidate_json, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const candidate of agentmon.skillCandidates || []) {
    insertCandidate.run(
      sha256(`${agentmon.id}:candidate:${candidate.id}`).slice(0, 32),
      agentmon.id,
      candidate.id,
      candidate.name,
      candidate.stage,
      Number(candidate.confidence) || 0,
      Number(candidate.evidenceCount) || 0,
      Number(candidate.behavioralEvidenceCount) || 0,
      Number(candidate.weightedEvidence) || 0,
      canonicalJson(candidate),
      updatedAt,
    );
  }

  db.prepare("DELETE FROM procedural_skills WHERE agentmon_id = ?").run(agentmon.id);
  const insertProcedure = db.prepare(`INSERT INTO procedural_skills(
    id, agentmon_id, procedure_key, name, stage, confidence, evidence_count,
    trainer_confirmed, procedure_json, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const procedure of agentmon.proceduralSkills || []) {
    insertProcedure.run(
      sha256(`${agentmon.id}:procedure:${procedure.id}`).slice(0, 32),
      agentmon.id,
      procedure.id,
      procedure.name,
      procedure.stage,
      Number(procedure.confidence) || 0,
      Number(procedure.evidenceCount) || 0,
      procedure.trainerConfirmed ? 1 : 0,
      canonicalJson(procedure),
      updatedAt,
    );
  }

  db.prepare("DELETE FROM procedure_trials WHERE agentmon_id = ?").run(agentmon.id);
  const insertTrial = db.prepare(`INSERT INTO procedure_trials(
    id, agentmon_id, procedure_key, variant, decision_quality, observed_outcome, recorded_at, trial_json, source, run_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const trial of agentmon.procedureTrials || []) {
    insertTrial.run(
      sha256(`${agentmon.id}:trial:${trial.id}`).slice(0, 32),
      agentmon.id,
      trial.procedureId,
      trial.variant,
      trial.decisionQuality,
      trial.outcome,
      trial.recordedAt,
      canonicalJson(trial),
      trial.source || "manual",
      trial.runId || null,
    );
  }

  db.prepare("DELETE FROM outcome_events WHERE agentmon_id = ?").run(agentmon.id);
  const insertOutcome = db.prepare(`INSERT INTO outcome_events(
    id, project_id, agentmon_id, task_digest, procedure_ids_json, observed_outcome,
    trainer_rating, retry_count, correction_level, score, provider, model, recorded_at, event_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const outcome of agentmon.outcomeEvents || []) {
    insertOutcome.run(outcome.id, project.id, agentmon.id, outcome.taskDigest, canonicalJson(outcome.procedureIds),
      outcome.outcome, outcome.rating, outcome.retryCount, outcome.correctionLevel, scoreOutcome(outcome),
      outcome.provider || null, outcome.model || null, outcome.recordedAt, canonicalJson(outcome));
  }

  db.prepare("DELETE FROM portability_results WHERE agentmon_id = ?").run(agentmon.id);
  const insertPortability = db.prepare(`INSERT INTO portability_results(
    id, project_id, agentmon_id, procedure_key, provider, model, suite_digest,
    baseline_score, agentmon_score, lift, recorded_at, result_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const result of agentmon.portabilityResults || []) {
    const id = sha256(`${agentmon.id}:${result.procedureId}:${result.provider}:${result.model}:${result.suiteDigest}`).slice(0, 32);
    insertPortability.run(id, project.id, agentmon.id, result.procedureId, result.provider, result.model,
      result.suiteDigest, result.baselineScore, result.agentmonScore, result.lift, result.recordedAt, canonicalJson(result));
  }

  if (input.eventType) {
    appendAgentmonEvent(db, rootDir, project.id, agentmon.id, {
      eventType: input.eventType,
      occurredAt: input.occurredAt || updatedAt,
      payload: input.eventPayload || {},
      idempotencyKey: input.idempotencyKey,
    });
  }
}

export function recordOwnership(db, record) {
  if (!record?.creatureId || !db.prepare("SELECT id FROM agentmons WHERE id = ?").get(record.creatureId)) return;
  const eventType = record.status || "ownership-update";
  const certificateId = record.certificateId || null;
  const id = sha256(`${record.creatureId}:${eventType}:${certificateId || record.updatedAt || "local"}`).slice(0, 32);
  db.prepare(`INSERT OR IGNORE INTO ownership_events(
      id, agentmon_id, event_type, owner_name, owner_fingerprint, counterparty_fingerprint,
      certificate_id, genesis_dna, current_dna, occurred_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id,
      record.creatureId,
      eventType,
      record.ownerName,
      record.ownerFingerprint || null,
      record.counterpartyFingerprint || null,
      certificateId,
      record.genesisDNA,
      record.currentDNA,
      record.updatedAt || now(),
      canonicalJson(safeDerivedPayload(record)),
    );
}
