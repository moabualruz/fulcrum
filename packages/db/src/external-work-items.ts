import type Database from "better-sqlite3";
import { ExternalWorkItemMirrorSchema, type ExternalWorkItemMirror } from "@fulcrum/shared";

type MirrorRow = Record<string, unknown>;

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") {
    return {};
  }
  const parsed = JSON.parse(value) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function fromRow(row: MirrorRow): ExternalWorkItemMirror {
  return ExternalWorkItemMirrorSchema.parse({
    mirrorId: row.mirror_id,
    taskId: row.task_id,
    adapterId: row.adapter_id,
    externalSystem: row.external_system,
    externalId: row.external_id,
    externalUrl: optionalString(row.external_url),
    sourceTitle: row.source_title,
    sourceBodySnapshot: optionalString(row.source_body_snapshot),
    sourceStatus: optionalString(row.source_status),
    sourceUpdatedAt: optionalString(row.source_updated_at),
    syncStatus: row.sync_status,
    conflictStatus: row.conflict_status ?? "none",
    lastImportAt: optionalString(row.last_import_at),
    lastWritebackAt: optionalString(row.last_writeback_at),
    writebackPreviewId: optionalString(row.writeback_preview_id),
    lastFailure: optionalString(row.last_failure),
    provenance: parseObject(row.provenance_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schemaVersion: row.schema_version
  });
}

export class ExternalWorkItemMirrorRepository {
  constructor(private readonly db: Database.Database) {}

  save(mirror: ExternalWorkItemMirror): ExternalWorkItemMirror {
    const parsed = ExternalWorkItemMirrorSchema.parse(mirror);
    this.db
      .prepare(
        `INSERT INTO external_work_item_mirrors (
          mirror_id, task_id, adapter_id, external_system, external_id, external_url,
          source_title, source_body_snapshot, source_status, source_updated_at, sync_status,
          conflict_status, last_import_at, last_writeback_at, writeback_preview_id, last_failure,
          provenance_json, created_at, updated_at, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(mirror_id) DO UPDATE SET
          task_id = excluded.task_id,
          adapter_id = excluded.adapter_id,
          external_system = excluded.external_system,
          external_id = excluded.external_id,
          external_url = excluded.external_url,
          source_title = excluded.source_title,
          source_body_snapshot = excluded.source_body_snapshot,
          source_status = excluded.source_status,
          source_updated_at = excluded.source_updated_at,
          sync_status = excluded.sync_status,
          conflict_status = excluded.conflict_status,
          last_import_at = excluded.last_import_at,
          last_writeback_at = excluded.last_writeback_at,
          writeback_preview_id = excluded.writeback_preview_id,
          last_failure = excluded.last_failure,
          provenance_json = excluded.provenance_json,
          updated_at = excluded.updated_at,
          schema_version = excluded.schema_version`
      )
      .run(
        parsed.mirrorId,
        parsed.taskId,
        parsed.adapterId,
        parsed.externalSystem,
        parsed.externalId,
        parsed.externalUrl ?? null,
        parsed.sourceTitle,
        parsed.sourceBodySnapshot ?? null,
        parsed.sourceStatus ?? null,
        parsed.sourceUpdatedAt ?? null,
        parsed.syncStatus,
        parsed.conflictStatus,
        parsed.lastImportAt ?? null,
        parsed.lastWritebackAt ?? null,
        parsed.writebackPreviewId ?? null,
        parsed.lastFailure ?? null,
        JSON.stringify(parsed.provenance),
        parsed.createdAt,
        parsed.updatedAt,
        parsed.schemaVersion
      );
    return parsed;
  }

  get(mirrorId: string): ExternalWorkItemMirror | undefined {
    const row = this.db
      .prepare("SELECT * FROM external_work_item_mirrors WHERE mirror_id = ?")
      .get(mirrorId);
    return row ? fromRow(row as MirrorRow) : undefined;
  }

  findByExternal(adapterId: string, externalId: string): ExternalWorkItemMirror | undefined {
    const row = this.db
      .prepare("SELECT * FROM external_work_item_mirrors WHERE adapter_id = ? AND external_id = ?")
      .get(adapterId, externalId);
    return row ? fromRow(row as MirrorRow) : undefined;
  }

  list(projectId?: string): ExternalWorkItemMirror[] {
    const sql = projectId
      ? `SELECT m.* FROM external_work_item_mirrors m
         JOIN tasks t ON t.task_id = m.task_id
         WHERE t.project_id = ?
         ORDER BY m.updated_at DESC`
      : "SELECT * FROM external_work_item_mirrors ORDER BY updated_at DESC";
    const statement = this.db.prepare(sql);
    return (projectId ? statement.all(projectId) : statement.all()).map((row) =>
      fromRow(row as MirrorRow)
    );
  }
}
