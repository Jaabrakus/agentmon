CREATE TABLE IF NOT EXISTS procedure_revisions (
  agentmon_id TEXT NOT NULL REFERENCES agentmons(id) ON DELETE CASCADE,
  procedure_key TEXT NOT NULL,
  revision_digest TEXT NOT NULL,
  provenance_kind TEXT NOT NULL,
  evidence_root TEXT NOT NULL,
  content_digest TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY(agentmon_id, revision_digest)
);

CREATE INDEX IF NOT EXISTS procedure_revisions_active_idx ON procedure_revisions(agentmon_id, procedure_key, active);

CREATE TABLE IF NOT EXISTS economy_state_commits (
  agentmon_id TEXT NOT NULL REFERENCES agentmons(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  state_root TEXT NOT NULL,
  parent_state_root TEXT,
  status TEXT NOT NULL CHECK (status IN ('local-unverified', 'verified', 'modded', 'revoked')),
  taints_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(agentmon_id, sequence),
  UNIQUE(agentmon_id, state_root)
);

CREATE TABLE IF NOT EXISTS agentmon_economy_heads (
  agentmon_id TEXT PRIMARY KEY REFERENCES agentmons(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  state_root TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('local-unverified', 'verified', 'modded', 'revoked')),
  taints_json TEXT NOT NULL,
  authority_fingerprint TEXT,
  authority_certificate_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS agentmon_economy_status_idx ON agentmon_economy_heads(status, updated_at);
