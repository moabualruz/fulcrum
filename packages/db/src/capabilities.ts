import type Database from "better-sqlite3";
import type { CapabilityHealthRecord } from "@fulcrum/shared";
import { CapabilityHealthRecordSchema, SCHEMA_VERSION } from "@fulcrum/shared";

type CapabilityRow = Record<string, unknown>;

function fromRow(row: CapabilityRow): CapabilityHealthRecord {
  return CapabilityHealthRecordSchema.parse({
    capabilityId: row.capability_id,
    state: row.state,
    blocking: Boolean(row.blocking),
    cause: row.cause ?? undefined,
    nextAction: row.next_action ?? undefined,
    privacyStatus: row.privacy_status,
    affectedWorkflows: JSON.parse(String(row.affected_workflows_json)),
    freshness: row.freshness
  });
}

export class CapabilityRepository {
  constructor(private readonly db: Database.Database) {}

  save(record: CapabilityHealthRecord, projectId?: string): CapabilityHealthRecord {
    const parsed = CapabilityHealthRecordSchema.parse(record);
    this.db
      .prepare(
        `INSERT INTO capability_health (
          capability_id, project_id, state, blocking, cause, next_action, privacy_status,
          affected_workflows_json, freshness, updated_at, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(capability_id) DO UPDATE SET
          project_id = excluded.project_id,
          state = excluded.state,
          blocking = excluded.blocking,
          cause = excluded.cause,
          next_action = excluded.next_action,
          privacy_status = excluded.privacy_status,
          affected_workflows_json = excluded.affected_workflows_json,
          freshness = excluded.freshness,
          updated_at = excluded.updated_at,
          schema_version = excluded.schema_version`
      )
      .run(
        parsed.capabilityId,
        projectId ?? null,
        parsed.state,
        parsed.blocking ? 1 : 0,
        parsed.cause ?? null,
        parsed.nextAction ?? null,
        parsed.privacyStatus,
        JSON.stringify(parsed.affectedWorkflows),
        parsed.freshness,
        new Date().toISOString(),
        SCHEMA_VERSION
      );
    return parsed;
  }

  list(): CapabilityHealthRecord[] {
    return this.db
      .prepare("SELECT * FROM capability_health ORDER BY capability_id ASC")
      .all()
      .map((row) => fromRow(row as CapabilityRow));
  }
}
