import type Database from "better-sqlite3";
import { RunEventSchema, type RunEvent } from "@fulcrum/shared";

export class EventRepository {
  constructor(private readonly db: Database.Database) {}

  append(event: Omit<RunEvent, "sequence"> & { sequence?: number }): RunEvent {
    const sequence =
      event.sequence ??
      Number(
        (
          this.db
            .prepare("SELECT COALESCE(MAX(sequence), -1) + 1 AS sequence FROM events")
            .get() as {
            sequence: number;
          }
        ).sequence
      );
    const parsed = RunEventSchema.parse({ ...event, sequence });
    this.db
      .prepare(
        `INSERT INTO events (
          event_id, sequence, timestamp, source, severity, type, project_id, task_id, run_id,
          correlation_id, payload_summary_json, payload_ref, artifact_refs_json,
          policy_decision_refs_json, redaction_status, degraded_json, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        parsed.eventId,
        parsed.sequence,
        parsed.timestamp,
        parsed.source,
        parsed.severity,
        parsed.type,
        parsed.projectId ?? null,
        parsed.taskId ?? null,
        parsed.runId ?? null,
        parsed.correlationId ?? null,
        JSON.stringify(parsed.payloadSummary),
        parsed.payloadRef,
        JSON.stringify(parsed.artifactRefs),
        JSON.stringify(parsed.policyDecisionRefs),
        parsed.redactionStatus,
        JSON.stringify(parsed.degraded),
        parsed.schemaVersion
      );
    return parsed;
  }

  listByRun(runId: string): RunEvent[] {
    return this.db
      .prepare("SELECT * FROM events WHERE run_id = ? ORDER BY sequence ASC")
      .all(runId)
      .map((row) => {
        const eventRow = row as Record<string, unknown>;
        return RunEventSchema.parse({
          schemaVersion: eventRow.schema_version,
          eventId: eventRow.event_id,
          sequence: eventRow.sequence,
          timestamp: eventRow.timestamp,
          source: eventRow.source,
          severity: eventRow.severity,
          type: eventRow.type,
          projectId: eventRow.project_id ?? undefined,
          taskId: eventRow.task_id ?? undefined,
          runId: eventRow.run_id ?? undefined,
          correlationId: eventRow.correlation_id ?? undefined,
          payloadSummary: JSON.parse(String(eventRow.payload_summary_json)),
          payloadRef: eventRow.payload_ref,
          artifactRefs: JSON.parse(String(eventRow.artifact_refs_json)),
          policyDecisionRefs: JSON.parse(String(eventRow.policy_decision_refs_json)),
          redactionStatus: eventRow.redaction_status,
          degraded: JSON.parse(String(eventRow.degraded_json))
        });
      });
  }
}
