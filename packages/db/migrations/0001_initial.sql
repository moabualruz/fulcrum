CREATE TABLE IF NOT EXISTS setup_state (
  setup_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  state_root TEXT NOT NULL,
  config_path TEXT NOT NULL,
  db_path TEXT NOT NULL,
  artifact_root TEXT NOT NULL,
  log_root TEXT NOT NULL,
  backup_root TEXT NOT NULL,
  managed_memory_root TEXT NOT NULL,
  privacy_mode TEXT NOT NULL,
  network_default TEXT NOT NULL,
  redaction_profile_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  privacy_mode TEXT NOT NULL,
  health_state TEXT NOT NULL,
  enabled_capabilities_json TEXT NOT NULL DEFAULT '[]',
  disabled_capabilities_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  title TEXT NOT NULL,
  description_snapshot TEXT,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  labels_json TEXT NOT NULL DEFAULT '[]',
  blocker_state TEXT,
  current_run_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  agent_id TEXT NOT NULL,
  command_identity TEXT NOT NULL,
  status TEXT NOT NULL,
  heartbeat_at TEXT,
  worktree_id TEXT,
  context_pack_id TEXT,
  redaction_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  sequence INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  source TEXT NOT NULL,
  severity TEXT NOT NULL,
  type TEXT NOT NULL,
  project_id TEXT,
  task_id TEXT,
  run_id TEXT,
  correlation_id TEXT,
  payload_summary_json TEXT NOT NULL,
  payload_ref TEXT,
  artifact_refs_json TEXT NOT NULL DEFAULT '[]',
  policy_decision_refs_json TEXT NOT NULL DEFAULT '[]',
  redaction_status TEXT NOT NULL,
  degraded_json TEXT NOT NULL DEFAULT '[]',
  schema_version TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_sequence ON events(sequence);
CREATE INDEX IF NOT EXISTS idx_events_run_sequence ON events(run_id, sequence);
