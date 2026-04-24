CREATE TABLE IF NOT EXISTS compliance_requirements (
  requirement_id TEXT PRIMARY KEY,
  source_file TEXT NOT NULL,
  source_line TEXT NOT NULL,
  text TEXT NOT NULL,
  priority TEXT NOT NULL,
  superseded_by TEXT,
  status TEXT NOT NULL,
  implementation_refs_json TEXT NOT NULL DEFAULT '[]',
  test_refs_json TEXT NOT NULL DEFAULT '[]',
  evidence_refs_json TEXT NOT NULL DEFAULT '[]',
  next_action TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_compliance_requirements_status ON compliance_requirements(status);
CREATE INDEX IF NOT EXISTS idx_compliance_requirements_source ON compliance_requirements(source_file);

CREATE TABLE IF NOT EXISTS install_targets (
  target_id TEXT PRIMARY KEY,
  command TEXT NOT NULL,
  runtime TEXT NOT NULL,
  artifact_path TEXT,
  required_capabilities_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  validation_evidence_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_migration_records (
  migration_id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL,
  source_path TEXT NOT NULL,
  backup_path TEXT,
  entity_counts_json TEXT NOT NULL DEFAULT '{}',
  checksum TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  repair_action TEXT,
  schema_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_canonical_migration_records_status ON canonical_migration_records(status);

CREATE TABLE IF NOT EXISTS capability_probes (
  capability_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mode TEXT NOT NULL,
  probe_kind TEXT NOT NULL,
  command TEXT,
  target TEXT,
  blocking_rule TEXT NOT NULL,
  privacy_status TEXT NOT NULL,
  affected_workflows_json TEXT NOT NULL DEFAULT '[]',
  next_action_template TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_capability_probes_mode ON capability_probes(mode);

CREATE TABLE IF NOT EXISTS agent_certifications (
  agent_id TEXT PRIMARY KEY,
  command TEXT NOT NULL,
  version TEXT,
  auth_status TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  roles_json TEXT NOT NULL DEFAULT '[]',
  prompt_mechanisms_json TEXT NOT NULL DEFAULT '[]',
  mcp_status TEXT NOT NULL,
  hook_status TEXT NOT NULL,
  local_only_behavior TEXT NOT NULL,
  acceptance_run_ids_json TEXT NOT NULL DEFAULT '[]',
  evidence_refs_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_certifications_status ON agent_certifications(status);

CREATE TABLE IF NOT EXISTS adapter_certifications (
  adapter_id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  test_mode TEXT NOT NULL,
  credential_status TEXT NOT NULL,
  ownership_boundary TEXT NOT NULL,
  offline_behavior TEXT NOT NULL,
  disablement_behavior TEXT NOT NULL,
  import_export_strategy TEXT NOT NULL,
  rebuild_strategy TEXT NOT NULL,
  privacy_notes TEXT NOT NULL,
  health_evidence_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_adapter_certifications_category ON adapter_certifications(category);
CREATE INDEX IF NOT EXISTS idx_adapter_certifications_status ON adapter_certifications(status);

CREATE TABLE IF NOT EXISTS invalidation_records (
  record_id TEXT PRIMARY KEY,
  derived_kind TEXT NOT NULL,
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  repo_head TEXT,
  working_tree_signature TEXT,
  ignore_config_hash TEXT,
  tool_version TEXT,
  generated_at TEXT NOT NULL,
  stale_at TEXT,
  stale_reason TEXT,
  rebuild_source TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invalidation_records_derived ON invalidation_records(derived_kind);
CREATE INDEX IF NOT EXISTS idx_invalidation_records_stale ON invalidation_records(stale_at);

CREATE TABLE IF NOT EXISTS release_evidence_packs (
  release_run_id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  environment_json TEXT NOT NULL DEFAULT '{}',
  commands_json TEXT NOT NULL DEFAULT '[]',
  artifacts_json TEXT NOT NULL DEFAULT '[]',
  logs_json TEXT NOT NULL DEFAULT '[]',
  compliance_summary_json TEXT NOT NULL DEFAULT '{}',
  pass INTEGER NOT NULL,
  failures_json TEXT NOT NULL DEFAULT '[]',
  next_actions_json TEXT NOT NULL DEFAULT '[]',
  redaction_status TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_release_evidence_packs_pass ON release_evidence_packs(pass);
