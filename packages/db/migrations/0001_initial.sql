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
  applied_by TEXT,
  last_doctor_id TEXT,
  privacy_mode TEXT NOT NULL,
  network_default TEXT NOT NULL,
  redaction_profile_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS capability_health (
  capability_id TEXT PRIMARY KEY,
  project_id TEXT,
  state TEXT NOT NULL,
  blocking INTEGER NOT NULL DEFAULT 0,
  cause TEXT,
  next_action TEXT,
  privacy_status TEXT NOT NULL,
  affected_workflows_json TEXT NOT NULL DEFAULT '[]',
  freshness TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  worktree_policy_id TEXT,
  ignored_path_policy_id TEXT,
  quality_gate_set_id TEXT,
  privacy_mode TEXT NOT NULL,
  health_state TEXT NOT NULL,
  enabled_capabilities_json TEXT NOT NULL DEFAULT '[]',
  disabled_capabilities_json TEXT NOT NULL DEFAULT '[]',
  adapter_mappings_json TEXT NOT NULL DEFAULT '{}',
  last_scanned_at TEXT,
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
  assigned_agent_id TEXT,
  current_run_id TEXT,
  linked_file_refs_json TEXT NOT NULL DEFAULT '[]',
  linked_memory_refs_json TEXT NOT NULL DEFAULT '[]',
  linked_artifact_refs_json TEXT NOT NULL DEFAULT '[]',
  linked_worktree_id TEXT,
  external_source TEXT,
  external_id TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS external_work_item_mirrors (
  mirror_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  adapter_id TEXT NOT NULL,
  external_system TEXT NOT NULL,
  external_id TEXT NOT NULL,
  external_url TEXT,
  source_title TEXT NOT NULL,
  source_body_snapshot TEXT,
  source_status TEXT,
  source_updated_at TEXT,
  sync_status TEXT NOT NULL,
  conflict_status TEXT,
  last_import_at TEXT,
  last_writeback_at TEXT,
  writeback_preview_id TEXT,
  last_failure TEXT,
  provenance_json TEXT NOT NULL DEFAULT '{}',
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
  started_at TEXT,
  ended_at TEXT,
  heartbeat_at TEXT,
  heartbeat_state TEXT,
  worktree_id TEXT,
  context_pack_id TEXT,
  event_stream_id TEXT,
  log_artifact_ids_json TEXT NOT NULL DEFAULT '[]',
  artifact_ids_json TEXT NOT NULL DEFAULT '[]',
  quality_gate_ids_json TEXT NOT NULL DEFAULT '[]',
  policy_decision_ids_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT,
  failure_reason TEXT,
  final_outcome TEXT,
  terminal_state_recorded_at TEXT,
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

CREATE TABLE IF NOT EXISTS artifacts (
  artifact_id TEXT PRIMARY KEY,
  project_id TEXT,
  task_id TEXT,
  run_id TEXT,
  type TEXT NOT NULL,
  local_ref TEXT NOT NULL,
  summary TEXT NOT NULL,
  hash TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_ref TEXT NOT NULL,
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  linked_refs_json TEXT NOT NULL DEFAULT '[]',
  retention TEXT NOT NULL,
  redaction_status TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_artifacts_run ON artifacts(run_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_task ON artifacts(task_id);

CREATE TABLE IF NOT EXISTS context_packs (
  context_pack_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  run_id TEXT,
  status TEXT NOT NULL,
  generated_at TEXT,
  budget INTEGER NOT NULL,
  budget_used INTEGER NOT NULL,
  lane_summaries_json TEXT NOT NULL DEFAULT '[]',
  omissions_json TEXT NOT NULL DEFAULT '[]',
  degraded_lanes_json TEXT NOT NULL DEFAULT '[]',
  freshness TEXT,
  export_refs_json TEXT NOT NULL DEFAULT '[]',
  policy_decision_ids_json TEXT NOT NULL DEFAULT '[]',
  redaction_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS context_items (
  context_item_id TEXT PRIMARY KEY,
  context_pack_id TEXT NOT NULL REFERENCES context_packs(context_pack_id),
  lane TEXT NOT NULL,
  type TEXT NOT NULL,
  source_ref_json TEXT NOT NULL,
  title TEXT NOT NULL,
  excerpt_ref TEXT,
  inclusion_reason TEXT NOT NULL,
  freshness TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  confidence REAL,
  limitation TEXT,
  tool_identity TEXT,
  budget_estimate INTEGER NOT NULL DEFAULT 0,
  rank INTEGER NOT NULL DEFAULT 0,
  redaction_status TEXT NOT NULL,
  linked_refs_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_entries (
  memory_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  body_ref TEXT NOT NULL,
  excerpt TEXT,
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  linked_task_ids_json TEXT NOT NULL DEFAULT '[]',
  linked_run_ids_json TEXT NOT NULL DEFAULT '[]',
  linked_file_refs_json TEXT NOT NULL DEFAULT '[]',
  linked_symbol_refs_json TEXT NOT NULL DEFAULT '[]',
  linked_artifact_ids_json TEXT NOT NULL DEFAULT '[]',
  backend TEXT NOT NULL,
  freshness TEXT NOT NULL,
  approved_by TEXT,
  export_status TEXT,
  redaction_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS code_evidence (
  evidence_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  query TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  line_start INTEGER,
  line_end INTEGER,
  symbol TEXT,
  source_tool TEXT NOT NULL,
  ignored_path_status TEXT NOT NULL,
  freshness TEXT NOT NULL,
  rank INTEGER NOT NULL,
  reason TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  linked_context_item_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  stale_at TEXT
);

CREATE TABLE IF NOT EXISTS graph_links (
  link_id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  evidence_ref TEXT,
  freshness TEXT NOT NULL,
  provenance_json TEXT NOT NULL DEFAULT '{}',
  confidence REAL,
  limitation TEXT,
  derived INTEGER NOT NULL DEFAULT 0,
  rebuild_source TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS worktree_allocations (
  worktree_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  run_id TEXT,
  path TEXT NOT NULL,
  branch TEXT NOT NULL,
  base_branch TEXT NOT NULL,
  base_commit TEXT,
  status TEXT NOT NULL,
  dirty_state TEXT NOT NULL,
  untracked_count INTEGER NOT NULL DEFAULT 0,
  uncommitted_count INTEGER NOT NULL DEFAULT 0,
  unpushed_commit_count INTEGER NOT NULL DEFAULT 0,
  conflict_state TEXT,
  active_run_count INTEGER NOT NULL DEFAULT 0,
  cleanup_eligibility TEXT NOT NULL,
  block_reason TEXT,
  last_checked_at TEXT,
  created_at TEXT NOT NULL,
  cleaned_at TEXT,
  updated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS policy_decisions (
  policy_decision_id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  requester TEXT NOT NULL,
  project_id TEXT,
  task_id TEXT,
  run_id TEXT,
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  approval_required INTEGER NOT NULL DEFAULT 0,
  approved_by TEXT,
  approval_time TEXT,
  audit_event_id TEXT,
  bypass_scope TEXT,
  expires_at TEXT,
  preview_ref TEXT,
  next_action TEXT,
  redaction_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_policy_decisions_status ON policy_decisions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_policy_decisions_subject ON policy_decisions(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_policy_decisions_run ON policy_decisions(run_id);

CREATE TABLE IF NOT EXISTS adapter_configurations (
  adapter_id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  ownership_boundary TEXT NOT NULL,
  network_required INTEGER NOT NULL DEFAULT 0,
  credential_status TEXT NOT NULL,
  privacy_notes TEXT NOT NULL,
  offline_behavior TEXT NOT NULL,
  disablement_behavior TEXT NOT NULL,
  import_export_strategy TEXT NOT NULL,
  rebuild_strategy TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quality_gates (
  gate_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 0,
  timeout_ms INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quality_gate_results (
  quality_gate_result_id TEXT PRIMARY KEY,
  gate_id TEXT NOT NULL REFERENCES quality_gates(gate_id),
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT,
  run_id TEXT,
  status TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  output_artifact_id TEXT,
  parsed_summary_json TEXT NOT NULL DEFAULT '{}',
  redaction_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backup_manifests (
  backup_id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  path TEXT NOT NULL,
  record_counts_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS export_manifests (
  export_id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  path TEXT NOT NULL,
  format TEXT NOT NULL,
  redaction_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_queue_items (
  queue_item_id TEXT PRIMARY KEY,
  project_id TEXT,
  task_id TEXT,
  run_id TEXT,
  worktree_id TEXT,
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS writeback_records (
  writeback_id TEXT PRIMARY KEY,
  task_id TEXT,
  run_id TEXT,
  adapter_id TEXT NOT NULL,
  status TEXT NOT NULL,
  preview_json TEXT NOT NULL DEFAULT '{}',
  policy_decision_id TEXT,
  last_failure TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);
