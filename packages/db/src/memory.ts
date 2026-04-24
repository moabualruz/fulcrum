import type Database from "better-sqlite3";
import { MemoryEntrySchema, type MemoryEntry } from "@fulcrum/shared";

type MemoryRow = Record<string, unknown>;

function parseJsonArray(value: unknown): unknown[] {
  if (typeof value !== "string") {
    return [];
  }
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed : [];
}

function fromRow(row: MemoryRow): MemoryEntry {
  return MemoryEntrySchema.parse({
    memoryId: row.memory_id,
    projectId: row.project_id,
    status: row.status,
    title: row.title,
    bodyRef: row.body_ref,
    excerpt: row.excerpt ?? undefined,
    sourceRefs: parseJsonArray(row.source_refs_json),
    linkedTaskIds: parseJsonArray(row.linked_task_ids_json).map(String),
    linkedRunIds: parseJsonArray(row.linked_run_ids_json).map(String),
    linkedFileRefs: parseJsonArray(row.linked_file_refs_json),
    linkedSymbolRefs: parseJsonArray(row.linked_symbol_refs_json),
    linkedArtifactIds: parseJsonArray(row.linked_artifact_ids_json).map(String),
    backend: row.backend,
    freshness: row.freshness,
    approvedBy: row.approved_by ?? undefined,
    exportStatus: row.export_status ?? "not_exported",
    redactionStatus: row.redaction_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schemaVersion: row.schema_version
  });
}

export class MemoryRepository {
  constructor(private readonly db: Database.Database) {}

  save(entry: MemoryEntry): MemoryEntry {
    const parsed = MemoryEntrySchema.parse(entry);
    this.db
      .prepare(
        `INSERT INTO memory_entries (
          memory_id, project_id, status, title, body_ref, excerpt, source_refs_json,
          linked_task_ids_json, linked_run_ids_json, linked_file_refs_json,
          linked_symbol_refs_json, linked_artifact_ids_json, backend, freshness,
          approved_by, export_status, redaction_status, created_at, updated_at, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(memory_id) DO UPDATE SET
          status = excluded.status,
          title = excluded.title,
          body_ref = excluded.body_ref,
          excerpt = excluded.excerpt,
          source_refs_json = excluded.source_refs_json,
          linked_task_ids_json = excluded.linked_task_ids_json,
          linked_run_ids_json = excluded.linked_run_ids_json,
          linked_file_refs_json = excluded.linked_file_refs_json,
          linked_symbol_refs_json = excluded.linked_symbol_refs_json,
          linked_artifact_ids_json = excluded.linked_artifact_ids_json,
          backend = excluded.backend,
          freshness = excluded.freshness,
          approved_by = excluded.approved_by,
          export_status = excluded.export_status,
          redaction_status = excluded.redaction_status,
          updated_at = excluded.updated_at,
          schema_version = excluded.schema_version`
      )
      .run(
        parsed.memoryId,
        parsed.projectId,
        parsed.status,
        parsed.title,
        parsed.bodyRef,
        parsed.excerpt ?? null,
        JSON.stringify(parsed.sourceRefs),
        JSON.stringify(parsed.linkedTaskIds),
        JSON.stringify(parsed.linkedRunIds),
        JSON.stringify(parsed.linkedFileRefs),
        JSON.stringify(parsed.linkedSymbolRefs),
        JSON.stringify(parsed.linkedArtifactIds),
        parsed.backend,
        parsed.freshness,
        parsed.approvedBy ?? null,
        parsed.exportStatus,
        parsed.redactionStatus,
        parsed.createdAt,
        parsed.updatedAt,
        parsed.schemaVersion
      );
    return parsed;
  }

  get(memoryId: string): MemoryEntry | undefined {
    const row = this.db.prepare("SELECT * FROM memory_entries WHERE memory_id = ?").get(memoryId);
    return row ? fromRow(row as MemoryRow) : undefined;
  }

  list(projectId?: string): MemoryEntry[] {
    const statement = projectId
      ? this.db.prepare(
          "SELECT * FROM memory_entries WHERE project_id = ? ORDER BY updated_at DESC"
        )
      : this.db.prepare("SELECT * FROM memory_entries ORDER BY updated_at DESC");
    return (projectId ? statement.all(projectId) : statement.all()).map((row) =>
      fromRow(row as MemoryRow)
    );
  }
}
