CREATE TABLE IF NOT EXISTS outcome_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agentmon_id TEXT NOT NULL REFERENCES agentmons(id) ON DELETE CASCADE,
  task_digest TEXT NOT NULL,
  procedure_ids_json TEXT NOT NULL,
  observed_outcome TEXT NOT NULL CHECK (observed_outcome IN ('success', 'failure', 'unknown')),
  trainer_rating TEXT NOT NULL CHECK (trainer_rating IN ('helped', 'neutral', 'missed')),
  retry_count INTEGER NOT NULL CHECK (retry_count BETWEEN 0 AND 20),
  correction_level TEXT NOT NULL CHECK (correction_level IN ('none', 'minor', 'major', 'replaced')),
  score INTEGER NOT NULL CHECK (score BETWEEN -100 AND 100),
  provider TEXT,
  model TEXT,
  recorded_at TEXT NOT NULL,
  event_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS outcome_events_agentmon_idx
  ON outcome_events(agentmon_id, recorded_at);
CREATE INDEX IF NOT EXISTS outcome_events_task_idx
  ON outcome_events(agentmon_id, task_digest);

CREATE TABLE IF NOT EXISTS portability_results (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agentmon_id TEXT NOT NULL REFERENCES agentmons(id) ON DELETE CASCADE,
  procedure_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  suite_digest TEXT NOT NULL,
  baseline_score INTEGER NOT NULL CHECK (baseline_score BETWEEN 0 AND 100),
  agentmon_score INTEGER NOT NULL CHECK (agentmon_score BETWEEN 0 AND 100),
  lift INTEGER NOT NULL CHECK (lift BETWEEN -100 AND 100),
  recorded_at TEXT NOT NULL,
  result_json TEXT NOT NULL,
  UNIQUE(agentmon_id, procedure_key, provider, model, suite_digest)
);

CREATE INDEX IF NOT EXISTS portability_results_agentmon_idx
  ON portability_results(agentmon_id, procedure_key, provider);
