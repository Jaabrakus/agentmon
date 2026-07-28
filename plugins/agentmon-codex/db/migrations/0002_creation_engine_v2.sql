CREATE TABLE IF NOT EXISTS prompt_observations (
  id TEXT PRIMARY KEY,
  agentmon_id TEXT NOT NULL REFERENCES agentmons(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  digest TEXT NOT NULL,
  intent TEXT NOT NULL CHECK (intent IN ('personal-preference', 'directive', 'product-spec', 'brainstorm', 'question', 'reference')),
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  learning_weight REAL NOT NULL CHECK (learning_weight BETWEEN 0 AND 1),
  signals_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(agentmon_id, source_id)
);

CREATE INDEX IF NOT EXISTS prompt_observations_agentmon_idx ON prompt_observations(agentmon_id, intent);

CREATE TABLE IF NOT EXISTS skill_candidates (
  id TEXT PRIMARY KEY,
  agentmon_id TEXT NOT NULL REFERENCES agentmons(id) ON DELETE CASCADE,
  skill_key TEXT NOT NULL,
  name TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('observed', 'hypothesis', 'validated', 'learned')),
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  evidence_count INTEGER NOT NULL CHECK (evidence_count >= 0),
  behavioral_evidence_count INTEGER NOT NULL CHECK (behavioral_evidence_count >= 0),
  weighted_evidence REAL NOT NULL CHECK (weighted_evidence >= 0),
  candidate_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(agentmon_id, skill_key)
);

CREATE INDEX IF NOT EXISTS skill_candidates_agentmon_idx ON skill_candidates(agentmon_id, stage);

CREATE TABLE IF NOT EXISTS procedural_skills (
  id TEXT PRIMARY KEY,
  agentmon_id TEXT NOT NULL REFERENCES agentmons(id) ON DELETE CASCADE,
  procedure_key TEXT NOT NULL,
  name TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('observed', 'hypothesis', 'validated', 'learned')),
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  evidence_count INTEGER NOT NULL CHECK (evidence_count >= 0),
  trainer_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (trainer_confirmed IN (0, 1)),
  procedure_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(agentmon_id, procedure_key)
);

CREATE INDEX IF NOT EXISTS procedural_skills_agentmon_idx ON procedural_skills(agentmon_id, stage);
