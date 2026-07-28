ALTER TABLE agentmon_economy_heads ADD COLUMN transition_sequence INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS authority_state_transitions (
  transition_id TEXT PRIMARY KEY,
  agentmon_id TEXT NOT NULL REFERENCES agentmons(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('learning', 'evolution')),
  parent_state_root TEXT NOT NULL,
  child_state_root TEXT NOT NULL,
  transition_sequence INTEGER NOT NULL CHECK(transition_sequence > 0),
  ownership_sequence INTEGER NOT NULL CHECK(ownership_sequence >= 0),
  authority_fingerprint TEXT NOT NULL,
  certificate_json TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  UNIQUE(agentmon_id, transition_sequence),
  UNIQUE(agentmon_id, parent_state_root)
);

CREATE INDEX IF NOT EXISTS authority_transitions_agentmon_idx
  ON authority_state_transitions(agentmon_id, transition_sequence);
