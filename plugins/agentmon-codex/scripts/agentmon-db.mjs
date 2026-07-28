import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DATABASE_FORMAT, appendAgentmonEvent, applyMigrations, canonicalJson, ensureProject, now, persistSnapshot, persistTrainer, readJson, recordOwnership, sha256, withTransaction } from "../lib/db/local-store.mjs";
import { verifyAuthorityCertificate } from "../lib/economy/authority-registry.mjs";

export function openAgentmonDatabase(rootDir = process.cwd()) {
  const absoluteRoot = resolve(rootDir);
  const databasePath = resolve(absoluteRoot, ".agentmon/agentmon.db");
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  chmodSync(databasePath, 0o600);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA busy_timeout = 5000");
  applyMigrations(db);
  const project = ensureProject(db, absoluteRoot);
  return { db, project, path: databasePath, rootDir: absoluteRoot, format: DATABASE_FORMAT };
}

export async function persistTrainerIdentity(rootDir, identity) {
  const store = openAgentmonDatabase(rootDir);
  try {
    return persistTrainer(store.db, identity);
  } finally {
    store.db.close();
  }
}

export async function persistAgentmonSnapshot(rootDir, input) {
  const store = openAgentmonDatabase(rootDir);
  try {
    withTransaction(store.db, () => persistSnapshot(store.db, store.rootDir, store.project, input));
    return { path: store.path, projectId: store.project.id };
  } finally {
    store.db.close();
  }
}

export async function readEconomyHead(rootDir, agentmonId) {
  const store = openAgentmonDatabase(rootDir);
  try {
    const row = store.db.prepare("SELECT * FROM agentmon_economy_heads WHERE agentmon_id = ?").get(agentmonId);
    return row ? { ...row, taints: JSON.parse(row.taints_json || "[]"), authorityCertificate: row.authority_certificate_json ? JSON.parse(row.authority_certificate_json) : null } : null;
  } finally {
    store.db.close();
  }
}

export async function certifyEconomyHead(rootDir, agentmonId, certificate) {
  const store = openAgentmonDatabase(rootDir);
  try {
    const head = store.db.prepare("SELECT * FROM agentmon_economy_heads WHERE agentmon_id = ?").get(agentmonId);
    if (!head) throw new Error(`No economy head for Agentmon ${agentmonId}.`);
    if (head.status === "modded" || JSON.parse(head.taints_json || "[]").length) throw new Error("A modded Agentmon cannot be certified.");
    const certificateBody = verifyAuthorityCertificate(certificate);
    if (certificateBody.format !== "agentmon.authority-state/v1" || certificateBody.agentmonId !== agentmonId || certificateBody.stateRoot !== head.state_root) throw new Error("Authority certificate does not match the current Agentmon state root.");
    store.db.prepare(`UPDATE agentmon_economy_heads
      SET status = 'verified', transition_sequence = ?, authority_fingerprint = ?, authority_certificate_json = ?, updated_at = ?
      WHERE agentmon_id = ?`)
      .run(Number(certificateBody.transitionSequence) || 0, certificate.issuer.fingerprint, canonicalJson(certificate), certificateBody.issuedAt, agentmonId);
    return { ...head, status: "verified", authorityCertificate: certificate };
  } finally {
    store.db.close();
  }
}

export async function applyAuthorityStateTransition(rootDir, agentmonId, certificate) {
  const body = verifyAuthorityCertificate(certificate);
  if (body.format !== "agentmon.authority-transition/v1" || body.agentmonId !== agentmonId) throw new Error("Expected an authority state-transition certificate for this Agentmon.");
  const store = openAgentmonDatabase(rootDir);
  try {
    return withTransaction(store.db, () => {
      const head = store.db.prepare("SELECT * FROM agentmon_economy_heads WHERE agentmon_id = ?").get(agentmonId);
      if (!head) throw new Error(`No economy head for Agentmon ${agentmonId}.`);
      if (head.authority_fingerprint && head.authority_fingerprint !== certificate.issuer.fingerprint) throw new Error("Transition certificate was signed by a different authority.");
      if (head.state_root !== body.childStateRoot) throw new Error("Local Agentmon does not match the certified transition child root.");
      if (Number(body.transitionSequence) !== Number(head.transition_sequence) + 1) throw new Error("Local transition sequence is stale or replayed.");
      const parentCommit = store.db.prepare("SELECT 1 FROM economy_state_commits WHERE agentmon_id = ? AND state_root = ?").get(agentmonId, body.parentStateRoot);
      if (!parentCommit) throw new Error("Certified transition parent root is not in local append-only history.");
      store.db.prepare(`INSERT INTO authority_state_transitions(
        transition_id, agentmon_id, kind, parent_state_root, child_state_root,
        transition_sequence, ownership_sequence, authority_fingerprint, certificate_json, applied_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(body.transitionId, agentmonId, body.kind, body.parentStateRoot, body.childStateRoot, body.transitionSequence, body.ownershipSequence, certificate.issuer.fingerprint, canonicalJson(certificate), body.createdAt);
      store.db.prepare(`UPDATE agentmon_economy_heads
        SET status = 'verified', transition_sequence = ?, authority_fingerprint = ?, authority_certificate_json = ?, updated_at = ?
        WHERE agentmon_id = ?`)
        .run(body.transitionSequence, certificate.issuer.fingerprint, canonicalJson(certificate), body.createdAt, agentmonId);
      return { ...head, status: "verified", transitionSequence: body.transitionSequence, authorityCertificate: certificate };
    });
  } finally { store.db.close(); }
}

export async function persistOwnershipEvent(rootDir, record) {
  const store = openAgentmonDatabase(rootDir);
  try {
    withTransaction(store.db, () => recordOwnership(store.db, record));
    return { path: store.path, projectId: store.project.id };
  } finally {
    store.db.close();
  }
}

export async function persistArenaRun(rootDir, run) {
  const store = openAgentmonDatabase(rootDir);
  try {
    if (!store.db.prepare("SELECT id FROM agentmons WHERE id = ?").get(run.agentmonId)) throw new Error(`Unknown Agentmon for arena run: ${run.agentmonId}`);
    withTransaction(store.db, () => {
      store.db.prepare(`INSERT INTO arena_runs(
        id, agentmon_id, procedure_key, suite_id, suite_version, suite_digest,
        config_digest, seed, contestant_json, judge_json, status, summary_json,
        started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          run.id,
          run.agentmonId,
          run.procedureId,
          run.lockedConfig.suite.id,
          run.lockedConfig.suite.version,
          run.lockedConfig.suite.digest,
          run.configDigest,
          run.lockedConfig.seed,
          canonicalJson(run.lockedConfig.contestant),
          run.lockedConfig.judge ? canonicalJson(run.lockedConfig.judge) : null,
          run.status,
          canonicalJson(run.summary),
          run.startedAt,
          run.completedAt || null,
        );
      const insertResult = store.db.prepare(`INSERT INTO arena_task_results(
        id, arena_run_id, task_key, repetition, blind_map_digest, baseline_score,
        agentmon_score, baseline_passed, agentmon_passed, generic_score, generic_passed, metrics_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const artifact of run.artifacts || []) {
        const metrics = {
          baseline: artifact.results.baseline,
          generic: artifact.results.generic || null,
          agentmon: artifact.results.agentmon,
        };
        insertResult.run(
          sha256(`${run.id}:${artifact.taskId}:${artifact.repetition}`).slice(0, 32),
          run.id,
          artifact.taskId,
          artifact.repetition,
          sha256(artifact.blindMap),
          artifact.results.baseline.score,
          artifact.results.agentmon.score,
          artifact.results.baseline.passed ? 1 : 0,
          artifact.results.agentmon.passed ? 1 : 0,
          artifact.results.generic?.score ?? null,
          artifact.results.generic ? (artifact.results.generic.passed ? 1 : 0) : null,
          canonicalJson(metrics),
        );
      }
    });
    return { path: store.path, runId: run.id };
  } finally {
    store.db.close();
  }
}

export async function readAgentmonSnapshot(rootDir, slot) {
  const store = openAgentmonDatabase(rootDir);
  try {
    const row = store.db.prepare("SELECT state_json FROM agentmons WHERE project_id = ? AND slot = ?").get(store.project.id, slot);
    return row ? JSON.parse(row.state_json) : null;
  } finally {
    store.db.close();
  }
}

export async function listAgentmonSnapshots(rootDir) {
  const store = openAgentmonDatabase(rootDir);
  try {
    return store.db.prepare(`SELECT slot, id, species, form, role, generation, ownership_status, updated_at
      FROM agentmons WHERE project_id = ? ORDER BY slot`).all(store.project.id);
  } finally {
    store.db.close();
  }
}

function legacyEventKey(state, entry, index) {
  const eventType = entry.event || (index === 0 ? "hatch" : "training");
  if (entry.revision && entry.engineVersion === "0.8.0") return `${eventType}:${state.id}:${entry.engineVersion}:${entry.revision}:${entry.calibrationRevision || "uncalibrated"}`;
  if (entry.revision && entry.engineVersion) return `${eventType}:${state.id}:${entry.engineVersion}:${entry.revision}`;
  if (eventType === "ownership-accepted" && entry.ownership?.certificateId) return `ownership-accepted:${entry.ownership.certificateId}`;
  if (eventType === "evolution" && entry.lineage?.toDNA) return `evolution:${state.id}:${entry.lineage.toDNA}`;
  if (eventType === "transfer-in" && entry.source?.packageIntegrity) {
    return `transfer-in:${state.id}:${entry.source.packageIntegrity}:${entry.lineage?.toTrainer || state.trainerName}`;
  }
  return `legacy:${state.id}:${sha256(entry)}`;
}

export async function migrateLegacyAgentmonData(rootDir = process.cwd()) {
  const store = openAgentmonDatabase(rootDir);
  let importedAgentmons = 0;
  let importedEvents = 0;
  try {
    const identity = await readJson(resolve(store.rootDir, ".agentmon/identity/trainer.json"));
    if (identity) {
      identity.publicKey = await readFile(resolve(store.rootDir, ".agentmon/identity/public-key.pem"), "utf8");
      persistTrainer(store.db, identity);
    }

    const rosterDir = resolve(store.rootDir, ".agentmon/roster");
    const slots = existsSync(rosterDir)
      ? readdirSync(rosterDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
      : [];
    for (const slot of slots) {
      const state = await readJson(resolve(rosterDir, slot, "agentmon.json"));
      if (!state) continue;
      const config = await readJson(resolve(rosterDir, slot, "config.json"), {});
      const ledger = await readJson(resolve(rosterDir, slot, "learning-ledger.json"), { entries: [] });
      const before = Number(store.db.prepare("SELECT COUNT(*) AS value FROM agentmons WHERE id = ?").get(state.id).value);
      withTransaction(store.db, () => {
        persistSnapshot(store.db, store.rootDir, store.project, { slot, agentmon: state, role: config.role || "builder" });
        for (const [index, entry] of (ledger.entries || []).entries()) {
          const eventType = entry.event || (index === 0 ? "hatch" : "training");
          const idempotencyKey = legacyEventKey(state, entry, index);
          const existing = store.db.prepare("SELECT id FROM agentmon_events WHERE idempotency_key = ?").get(idempotencyKey);
          appendAgentmonEvent(store.db, store.rootDir, store.project.id, state.id, {
            eventType,
            occurredAt: entry.trainedAt || entry.observedAt || state.trainedAt,
            payload: entry,
            idempotencyKey,
          });
          if (!existing) importedEvents += 1;
        }
        if (!(ledger.entries || []).length) {
          const idempotencyKey = `legacy:${state.id}:snapshot:${sha256(state)}`;
          const existing = store.db.prepare("SELECT id FROM agentmon_events WHERE idempotency_key = ?").get(idempotencyKey);
          appendAgentmonEvent(store.db, store.rootDir, store.project.id, state.id, {
            eventType: "legacy-import",
            occurredAt: state.trainedAt,
            payload: { source: "json-roster", rawPromptTextStored: false },
            idempotencyKey,
          });
          if (!existing) importedEvents += 1;
        }
      });
      if (!before) importedAgentmons += 1;
    }

    const registry = await readJson(resolve(store.rootDir, ".agentmon/ownership-registry.json"), { entries: [] });
    withTransaction(store.db, () => {
      for (const record of registry.entries || []) recordOwnership(store.db, record);
    });

    const feedsDir = resolve(store.rootDir, ".agentmon/feeds");
    if (existsSync(feedsDir)) {
      const insertConsent = store.db.prepare(`INSERT OR IGNORE INTO consent_grants(
        id, project_id, source_adapter, scope, granted_at
      ) VALUES (?, ?, ?, ?, ?)`);
      for (const filename of readdirSync(feedsDir).filter((name) => name.endsWith(".json"))) {
        const feed = await readJson(resolve(feedsDir, filename));
        if (feed?.consent?.scope) {
          const source = feed.source || "unknown";
          const id = sha256(`${store.project.id}:${source}:${feed.consent.scope}`).slice(0, 32);
          insertConsent.run(id, store.project.id, source, feed.consent.scope, feed.generatedAt || now());
        }
      }
    }

    return { path: store.path, projectId: store.project.id, importedAgentmons, importedEvents };
  } finally {
    store.db.close();
  }
}

export async function databaseStatus(rootDir = process.cwd()) {
  const store = openAgentmonDatabase(rootDir);
  try {
    const count = (table) => Number(store.db.prepare(`SELECT COUNT(*) AS value FROM ${table}`).get().value);
    return {
      format: DATABASE_FORMAT,
      path: store.path,
      projectId: store.project.id,
      schemaVersion: Number(store.db.prepare("SELECT COALESCE(MAX(version), 0) AS value FROM schema_migrations").get().value),
      agentmons: count("agentmons"),
      events: count("agentmon_events"),
      skills: count("skills"),
      observations: count("prompt_observations"),
      episodes: count("decision_episodes"),
      hypotheses: count("behavior_hypotheses"),
      candidates: count("skill_candidates"),
      procedures: count("procedural_skills"),
      arenaTrials: count("procedure_trials"),
      arenaRuns: count("arena_runs"),
      outcomes: count("outcome_events"),
      portabilityResults: count("portability_results"),
      economyHeads: count("agentmon_economy_heads"),
      verifiedEconomy: Number(store.db.prepare("SELECT COUNT(*) AS value FROM agentmon_economy_heads WHERE status = 'verified'").get().value),
      moddedEconomy: Number(store.db.prepare("SELECT COUNT(*) AS value FROM agentmon_economy_heads WHERE status = 'modded'").get().value),
      quests: count("quests"),
      missions: count("missions"),
      runs: count("runs"),
      pendingSync: Number(store.db.prepare("SELECT COUNT(*) AS value FROM sync_outbox WHERE status = 'pending'").get().value),
    };
  } finally {
    store.db.close();
  }
}

export async function createQuest(rootDir, input) {
  const title = String(input.title || "").trim();
  const objective = String(input.objective || "").trim();
  if (!title || !objective) throw new Error("Quest creation requires a title and objective.");
  const store = openAgentmonDatabase(rootDir);
  try {
    const id = randomUUID();
    const createdAt = now();
    store.db.prepare(`INSERT INTO quests(id, project_id, title, objective, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'draft', ?, ?)`)
      .run(id, store.project.id, title, objective, createdAt, createdAt);
    return store.db.prepare("SELECT id, title, objective, status, created_at, updated_at FROM quests WHERE id = ?").get(id);
  } finally {
    store.db.close();
  }
}

export async function listQuests(rootDir = process.cwd()) {
  const store = openAgentmonDatabase(rootDir);
  try {
    return store.db.prepare(`SELECT id, title, objective, status, created_at, updated_at
      FROM quests WHERE project_id = ? ORDER BY created_at DESC`).all(store.project.id);
  } finally {
    store.db.close();
  }
}
