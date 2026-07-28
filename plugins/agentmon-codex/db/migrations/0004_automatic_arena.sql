CREATE TABLE IF NOT EXISTS arena_runs (
  id TEXT PRIMARY KEY,
  agentmon_id TEXT NOT NULL REFERENCES agentmons(id) ON DELETE CASCADE,
  procedure_key TEXT NOT NULL,
  suite_id TEXT NOT NULL,
  suite_version INTEGER NOT NULL CHECK (suite_version > 0),
  suite_digest TEXT NOT NULL,
  config_digest TEXT NOT NULL,
  seed TEXT NOT NULL,
  contestant_json TEXT NOT NULL,
  judge_json TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  summary_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS arena_runs_agentmon_idx ON arena_runs(agentmon_id, procedure_key, completed_at);

CREATE TABLE IF NOT EXISTS arena_task_results (
  id TEXT PRIMARY KEY,
  arena_run_id TEXT NOT NULL REFERENCES arena_runs(id) ON DELETE CASCADE,
  task_key TEXT NOT NULL,
  repetition INTEGER NOT NULL CHECK (repetition > 0),
  blind_map_digest TEXT NOT NULL,
  baseline_score INTEGER NOT NULL CHECK (baseline_score BETWEEN 0 AND 100),
  agentmon_score INTEGER NOT NULL CHECK (agentmon_score BETWEEN 0 AND 100),
  baseline_passed INTEGER NOT NULL CHECK (baseline_passed IN (0, 1)),
  agentmon_passed INTEGER NOT NULL CHECK (agentmon_passed IN (0, 1)),
  metrics_json TEXT NOT NULL,
  UNIQUE(arena_run_id, task_key, repetition)
);

CREATE INDEX IF NOT EXISTS arena_task_results_run_idx ON arena_task_results(arena_run_id, task_key);
