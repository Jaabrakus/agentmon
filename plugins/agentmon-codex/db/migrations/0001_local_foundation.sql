CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trainers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  trainer_id TEXT REFERENCES trainers(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS squads (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agentmons (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  species TEXT NOT NULL,
  form TEXT NOT NULL,
  role TEXT NOT NULL,
  genesis_dna TEXT NOT NULL,
  current_dna TEXT NOT NULL,
  generation INTEGER NOT NULL DEFAULT 1 CHECK (generation > 0),
  owner_name TEXT NOT NULL,
  owner_fingerprint TEXT,
  ownership_status TEXT NOT NULL,
  state_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, slot)
);

CREATE INDEX IF NOT EXISTS agentmons_project_idx ON agentmons(project_id);
CREATE INDEX IF NOT EXISTS agentmons_owner_idx ON agentmons(owner_fingerprint);

CREATE TABLE IF NOT EXISTS squad_members (
  squad_id TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  agentmon_id TEXT NOT NULL REFERENCES agentmons(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  role TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(squad_id, agentmon_id),
  UNIQUE(squad_id, slot)
);

CREATE TABLE IF NOT EXISTS agentmon_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agentmon_id TEXT NOT NULL REFERENCES agentmons(id) ON DELETE CASCADE,
  device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  event_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  signature TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'synced', 'failed', 'local-only')),
  created_at TEXT NOT NULL,
  UNIQUE(agentmon_id, sequence)
);

CREATE INDEX IF NOT EXISTS agentmon_events_project_idx ON agentmon_events(project_id, occurred_at);
CREATE INDEX IF NOT EXISTS agentmon_events_sync_idx ON agentmon_events(sync_status, occurred_at);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  agentmon_id TEXT NOT NULL REFERENCES agentmons(id) ON DELETE CASCADE,
  skill_key TEXT NOT NULL,
  name TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'learned' CHECK (branch IN ('learned', 'inherited', 'acquired', 'fusion')),
  evidence INTEGER NOT NULL DEFAULT 0 CHECK (evidence >= 0),
  skill_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(agentmon_id, skill_key, branch)
);

CREATE INDEX IF NOT EXISTS skills_agentmon_idx ON skills(agentmon_id);

CREATE TABLE IF NOT EXISTS ownership_events (
  id TEXT PRIMARY KEY,
  agentmon_id TEXT NOT NULL REFERENCES agentmons(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  owner_fingerprint TEXT,
  counterparty_fingerprint TEXT,
  certificate_id TEXT,
  genesis_dna TEXT NOT NULL,
  current_dna TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  UNIQUE(certificate_id, event_type)
);

CREATE INDEX IF NOT EXISTS ownership_events_agentmon_idx ON ownership_events(agentmon_id, occurred_at);

CREATE TABLE IF NOT EXISTS quests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'running', 'review', 'completed', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS quests_project_idx ON quests(project_id, updated_at);

CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  quest_id TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'running', 'blocked', 'review', 'completed', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(quest_id, position)
);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  agentmon_id TEXT NOT NULL REFERENCES agentmons(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'claimed', 'running', 'review', 'completed', 'released')),
  lease_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(mission_id, agentmon_id)
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  quest_id TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  mission_id TEXT REFERENCES missions(id) ON DELETE SET NULL,
  agentmon_id TEXT NOT NULL REFERENCES agentmons(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'waiting', 'review', 'succeeded', 'failed', 'cancelled')),
  token_budget INTEGER CHECK (token_budget IS NULL OR token_budget >= 0),
  cost_budget_cents INTEGER CHECK (cost_budget_cents IS NULL OR cost_budget_cents >= 0),
  tokens_used INTEGER NOT NULL DEFAULT 0 CHECK (tokens_used >= 0),
  cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  started_at TEXT,
  finished_at TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS runs_quest_idx ON runs(quest_id, status);
CREATE INDEX IF NOT EXISTS runs_agentmon_idx ON runs(agentmon_id, status);

CREATE TABLE IF NOT EXISTS run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  UNIQUE(run_id, sequence)
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  local_path TEXT,
  content_digest TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  sync_status TEXT NOT NULL DEFAULT 'local-only' CHECK (sync_status IN ('local-only', 'pending', 'synced', 'failed')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_permissions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agentmon_id TEXT REFERENCES agentmons(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('allow', 'ask', 'deny')),
  granted_at TEXT NOT NULL,
  expires_at TEXT,
  UNIQUE(project_id, agentmon_id, capability)
);

CREATE TABLE IF NOT EXISTS consent_grants (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_adapter TEXT NOT NULL,
  scope TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE(project_id, source_adapter, scope)
);

CREATE TABLE IF NOT EXISTS sync_outbox (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE REFERENCES agentmon_events(id) ON DELETE CASCADE,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  envelope_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS sync_outbox_status_idx ON sync_outbox(status, next_attempt_at, created_at);
