CREATE TABLE IF NOT EXISTS recovery_backup_manifests (
  backup_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  source_state_root TEXT NOT NULL,
  included_records_json TEXT NOT NULL DEFAULT '{}',
  included_artifacts_json TEXT NOT NULL DEFAULT '[]',
  included_logs_json TEXT NOT NULL DEFAULT '[]',
  included_memory_json TEXT NOT NULL DEFAULT '[]',
  included_context_packs_json TEXT NOT NULL DEFAULT '[]',
  integrity_status TEXT NOT NULL,
  restore_target TEXT,
  redaction_status TEXT NOT NULL,
  purge_approval_decision_id TEXT,
  local_ref TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recovery_export_records (
  export_id TEXT PRIMARY KEY,
  format TEXT NOT NULL,
  included_entity_classes_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  local_ref TEXT NOT NULL,
  redaction_status TEXT NOT NULL,
  provenance_coverage TEXT NOT NULL,
  policy_decision_id TEXT,
  content_hash TEXT NOT NULL,
  schema_version TEXT NOT NULL
);
