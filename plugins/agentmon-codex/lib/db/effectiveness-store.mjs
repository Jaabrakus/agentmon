import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { applyMigrations, canonicalJson, ensureProject, sha256, withTransaction } from "./local-store.mjs";
import { scoreOutcome } from "../effectiveness/outcome-engine.mjs";

function open(rootDir) {
  const absoluteRoot = resolve(rootDir || process.cwd());
  const path = resolve(absoluteRoot, ".agentmon/agentmon.db");
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  chmodSync(path, 0o600);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  applyMigrations(db);
  return { db, project: ensureProject(db, absoluteRoot), path };
}

export function persistOutcomeEvent(rootDir, event) {
  const store = open(rootDir);
  try {
    if (!store.db.prepare("SELECT id FROM agentmons WHERE id = ?").get(event.agentmonId)) throw new Error(`Unknown Agentmon for outcome: ${event.agentmonId}.`);
    withTransaction(store.db, () => {
      store.db.prepare(`INSERT INTO outcome_events(
        id, project_id, agentmon_id, task_digest, procedure_ids_json, observed_outcome,
        trainer_rating, retry_count, correction_level, score, provider, model, recorded_at, event_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING`).run(
        event.id, store.project.id, event.agentmonId, event.taskDigest,
        canonicalJson(event.procedureIds), event.outcome, event.rating, event.retryCount,
        event.correctionLevel, scoreOutcome(event), event.provider, event.model,
        event.recordedAt, canonicalJson(event),
      );
    });
    return { path: store.path, id: event.id };
  } finally { store.db.close(); }
}

export function persistPortabilityResult(rootDir, agentmonId, result) {
  const store = open(rootDir);
  try {
    if (!store.db.prepare("SELECT id FROM agentmons WHERE id = ?").get(agentmonId)) throw new Error(`Unknown Agentmon for portability result: ${agentmonId}.`);
    const id = sha256(`${agentmonId}:${result.procedureId}:${result.provider}:${result.model}:${result.suiteDigest}`).slice(0, 32);
    store.db.prepare(`INSERT INTO portability_results(
      id, project_id, agentmon_id, procedure_key, provider, model, suite_digest,
      baseline_score, agentmon_score, lift, recorded_at, result_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(agentmon_id, procedure_key, provider, model, suite_digest) DO UPDATE SET
      baseline_score = excluded.baseline_score, agentmon_score = excluded.agentmon_score,
      lift = excluded.lift, recorded_at = excluded.recorded_at, result_json = excluded.result_json`)
      .run(id, store.project.id, agentmonId, result.procedureId, result.provider, result.model,
        result.suiteDigest, result.baselineScore, result.agentmonScore, result.lift,
        result.recordedAt, canonicalJson(result));
    return { path: store.path, id };
  } finally { store.db.close(); }
}

export function effectivenessDatabaseStatus(rootDir) {
  const store = open(rootDir);
  try {
    const count = (table) => Number(store.db.prepare(`SELECT COUNT(*) AS value FROM ${table}`).get().value);
    return { outcomes: count("outcome_events"), portabilityResults: count("portability_results") };
  } finally { store.db.close(); }
}
