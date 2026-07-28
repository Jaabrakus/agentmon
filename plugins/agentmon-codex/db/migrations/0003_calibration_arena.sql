CREATE TABLE IF NOT EXISTS decision_episodes (
  id TEXT PRIMARY KEY,
  agentmon_id TEXT NOT NULL REFERENCES agentmons(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  digest TEXT NOT NULL,
  predicted_intent TEXT NOT NULL,
  engine_intent TEXT NOT NULL,
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  resolution_status TEXT NOT NULL CHECK (resolution_status IN ('unreviewed', 'trainer-corrected')),
  corrected_intent TEXT,
  context_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(agentmon_id, source_id)
);

CREATE INDEX IF NOT EXISTS decision_episodes_agentmon_idx ON decision_episodes(agentmon_id, resolution_status);

CREATE TABLE IF NOT EXISTS behavior_hypotheses (
  id TEXT PRIMARY KEY,
  agentmon_id TEXT NOT NULL REFERENCES agentmons(id) ON DELETE CASCADE,
  skill_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'strengthened', 'weakened', 'confirmed', 'rejected')),
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  evidence_for_count INTEGER NOT NULL CHECK (evidence_for_count >= 0),
  evidence_against_count INTEGER NOT NULL CHECK (evidence_against_count >= 0),
  hypothesis_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(agentmon_id, skill_key)
);

CREATE INDEX IF NOT EXISTS behavior_hypotheses_agentmon_idx ON behavior_hypotheses(agentmon_id, status);

CREATE TABLE IF NOT EXISTS procedure_trials (
  id TEXT PRIMARY KEY,
  agentmon_id TEXT NOT NULL REFERENCES agentmons(id) ON DELETE CASCADE,
  procedure_key TEXT NOT NULL,
  variant TEXT NOT NULL CHECK (variant IN ('baseline', 'agentmon')),
  decision_quality TEXT NOT NULL CHECK (decision_quality IN ('pass', 'fail')),
  observed_outcome TEXT NOT NULL CHECK (observed_outcome IN ('success', 'failure', 'unknown')),
  recorded_at TEXT NOT NULL,
  trial_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS procedure_trials_agentmon_idx ON procedure_trials(agentmon_id, procedure_key, variant);
