import type Database from "better-sqlite3";
import {
  BackupManifestSchema,
  ExportRecordSchema,
  type BackupManifest,
  type ExportRecord
} from "@fulcrum/shared";

type Row = Record<string, unknown>;

function parseJson<T>(value: unknown, fallback: T): T {
  return value ? (JSON.parse(String(value)) as T) : fallback;
}

function backupFromRow(row: Row): BackupManifest {
  return BackupManifestSchema.parse({
    backupId: row.backup_id,
    createdAt: row.created_at,
    sourceStateRoot: row.source_state_root,
    includedRecords: parseJson(row.included_records_json, {}),
    includedArtifacts: parseJson(row.included_artifacts_json, []),
    includedLogs: parseJson(row.included_logs_json, []),
    includedMemory: parseJson(row.included_memory_json, []),
    includedContextPacks: parseJson(row.included_context_packs_json, []),
    integrityStatus: row.integrity_status,
    restoreTarget: row.restore_target ?? undefined,
    redactionStatus: row.redaction_status,
    purgeApprovalDecisionId: row.purge_approval_decision_id ?? undefined,
    localRef: row.local_ref,
    contentHash: row.content_hash,
    schemaVersion: row.schema_version
  });
}

function exportFromRow(row: Row): ExportRecord {
  return ExportRecordSchema.parse({
    exportId: row.export_id,
    format: row.format,
    includedEntityClasses: parseJson(row.included_entity_classes_json, []),
    createdAt: row.created_at,
    localRef: row.local_ref,
    redactionStatus: row.redaction_status,
    provenanceCoverage: row.provenance_coverage,
    policyDecisionId: row.policy_decision_id ?? undefined,
    contentHash: row.content_hash,
    schemaVersion: row.schema_version
  });
}

export class BackupRepository {
  constructor(private readonly db: Database.Database) {}

  save(manifest: BackupManifest): BackupManifest {
    const parsed = BackupManifestSchema.parse(manifest);
    this.db
      .prepare(
        `INSERT INTO recovery_backup_manifests (
          backup_id, created_at, source_state_root, included_records_json, included_artifacts_json,
          included_logs_json, included_memory_json, included_context_packs_json, integrity_status,
          restore_target, redaction_status, purge_approval_decision_id, local_ref, content_hash,
          schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(backup_id) DO UPDATE SET
          restore_target = excluded.restore_target,
          integrity_status = excluded.integrity_status`
      )
      .run(
        parsed.backupId,
        parsed.createdAt,
        parsed.sourceStateRoot,
        JSON.stringify(parsed.includedRecords),
        JSON.stringify(parsed.includedArtifacts),
        JSON.stringify(parsed.includedLogs),
        JSON.stringify(parsed.includedMemory),
        JSON.stringify(parsed.includedContextPacks),
        parsed.integrityStatus,
        parsed.restoreTarget ?? null,
        parsed.redactionStatus,
        parsed.purgeApprovalDecisionId ?? null,
        parsed.localRef,
        parsed.contentHash,
        parsed.schemaVersion
      );
    return parsed;
  }

  get(backupId: string): BackupManifest | undefined {
    const row = this.db
      .prepare("SELECT * FROM recovery_backup_manifests WHERE backup_id = ?")
      .get(backupId);
    return row ? backupFromRow(row as Row) : undefined;
  }

  list(): BackupManifest[] {
    return this.db
      .prepare("SELECT * FROM recovery_backup_manifests ORDER BY created_at DESC")
      .all()
      .map((row) => backupFromRow(row as Row));
  }
}

export class ExportRepository {
  constructor(private readonly db: Database.Database) {}

  save(record: ExportRecord): ExportRecord {
    const parsed = ExportRecordSchema.parse(record);
    this.db
      .prepare(
        `INSERT INTO recovery_export_records (
          export_id, format, included_entity_classes_json, created_at, local_ref,
          redaction_status, provenance_coverage, policy_decision_id, content_hash, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(export_id) DO UPDATE SET
          local_ref = excluded.local_ref,
          redaction_status = excluded.redaction_status`
      )
      .run(
        parsed.exportId,
        parsed.format,
        JSON.stringify(parsed.includedEntityClasses),
        parsed.createdAt,
        parsed.localRef,
        parsed.redactionStatus,
        parsed.provenanceCoverage,
        parsed.policyDecisionId ?? null,
        parsed.contentHash,
        parsed.schemaVersion
      );
    return parsed;
  }

  list(): ExportRecord[] {
    return this.db
      .prepare("SELECT * FROM recovery_export_records ORDER BY created_at DESC")
      .all()
      .map((row) => exportFromRow(row as Row));
  }
}
