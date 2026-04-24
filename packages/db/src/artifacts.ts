import type Database from "better-sqlite3";
import { ArtifactContractSchema, type ArtifactContract } from "@fulcrum/shared";

type ArtifactRow = Record<string, unknown>;

function toRow(artifact: ArtifactContract & { createdAt: string; updatedAt: string }): unknown[] {
  return [
    artifact.artifactId,
    artifact.projectId ?? null,
    artifact.taskId ?? null,
    artifact.runId ?? null,
    artifact.type,
    artifact.localRef,
    artifact.summary,
    artifact.hash,
    artifact.sizeBytes,
    artifact.storageRef,
    JSON.stringify(artifact.sourceRefs),
    JSON.stringify(artifact.linkedRefs),
    artifact.retention,
    artifact.redactionStatus,
    JSON.stringify(artifact.provenance),
    artifact.createdAt,
    artifact.updatedAt,
    artifact.schemaVersion
  ];
}

function fromRow(row: ArtifactRow): ArtifactContract & { createdAt: string; updatedAt: string } {
  return {
    ...ArtifactContractSchema.parse({
      artifactId: row.artifact_id,
      projectId: row.project_id ?? undefined,
      taskId: row.task_id ?? undefined,
      runId: row.run_id ?? undefined,
      type: row.type,
      localRef: row.local_ref,
      summary: row.summary,
      hash: row.hash,
      sizeBytes: row.size_bytes,
      storageRef: row.storage_ref,
      sourceRefs: JSON.parse(String(row.source_refs_json)),
      linkedRefs: JSON.parse(String(row.linked_refs_json)),
      retention: row.retention,
      redactionStatus: row.redaction_status,
      provenance: JSON.parse(String(row.provenance_json)),
      schemaVersion: row.schema_version
    }),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export class ArtifactRepository {
  constructor(private readonly db: Database.Database) {}

  save(artifact: ArtifactContract & { createdAt: string; updatedAt: string }): ArtifactContract {
    const parsed = ArtifactContractSchema.parse(artifact);
    this.db
      .prepare(
        `INSERT INTO artifacts (
          artifact_id, project_id, task_id, run_id, type, local_ref, summary, hash, size_bytes,
          storage_ref, source_refs_json, linked_refs_json, retention, redaction_status,
          provenance_json, created_at, updated_at, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(artifact_id) DO UPDATE SET
          project_id = excluded.project_id,
          task_id = excluded.task_id,
          run_id = excluded.run_id,
          summary = excluded.summary,
          linked_refs_json = excluded.linked_refs_json,
          retention = excluded.retention,
          redaction_status = excluded.redaction_status,
          updated_at = excluded.updated_at`
      )
      .run(...toRow({ ...parsed, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }));
    return parsed;
  }

  get(
    artifactId: string
  ): (ArtifactContract & { createdAt: string; updatedAt: string }) | undefined {
    const row = this.db.prepare("SELECT * FROM artifacts WHERE artifact_id = ?").get(artifactId);
    return row ? fromRow(row as ArtifactRow) : undefined;
  }

  listByRun(runId: string): ArtifactContract[] {
    return this.db
      .prepare("SELECT * FROM artifacts WHERE run_id = ? ORDER BY created_at ASC")
      .all(runId)
      .map((row) => fromRow(row as ArtifactRow));
  }
}
