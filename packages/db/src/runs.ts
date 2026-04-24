import type Database from "better-sqlite3";
import { RunEventSchema, RunSchema, type Run, type RunEvent } from "@fulcrum/shared";

type Row = Record<string, unknown>;

export interface RunRepositoryPort {
  save(run: Run): Run;
  get(runId: string): Run | undefined;
  list(projectId?: string): Run[];
  appendEvent(event: Omit<RunEvent, "sequence">): RunEvent;
  listEvents(runId: string): RunEvent[];
}

function parseJsonArray(value: unknown): string[] {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : [];
  return Array.isArray(parsed) ? parsed.map(String) : [];
}

function runFromRow(row: Row): Run {
  return RunSchema.parse({
    runId: row.run_id,
    taskId: row.task_id,
    projectId: row.project_id,
    agentId: row.agent_id,
    commandIdentity: row.command_identity,
    status: row.status,
    startedAt: row.started_at ?? undefined,
    endedAt: row.ended_at ?? undefined,
    heartbeatAt: row.heartbeat_at ?? undefined,
    heartbeatState: row.heartbeat_state ?? "missing",
    worktreeId: row.worktree_id ?? undefined,
    contextPackId: row.context_pack_id ?? undefined,
    eventStreamId: row.event_stream_id ?? undefined,
    logArtifactIds: parseJsonArray(row.log_artifact_ids_json),
    artifactIds: parseJsonArray(row.artifact_ids_json),
    qualityGateIds: parseJsonArray(row.quality_gate_ids_json),
    policyDecisionIds: parseJsonArray(row.policy_decision_ids_json),
    summary: row.summary ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    finalOutcome: row.final_outcome ?? undefined,
    terminalStateRecordedAt: row.terminal_state_recorded_at ?? undefined,
    redactionStatus: row.redaction_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schemaVersion: row.schema_version
  });
}

function eventFromRow(row: Row): RunEvent {
  return RunEventSchema.parse({
    schemaVersion: row.schema_version,
    eventId: row.event_id,
    sequence: row.sequence,
    timestamp: row.timestamp,
    source: row.source,
    severity: row.severity,
    type: row.type,
    projectId: row.project_id ?? undefined,
    taskId: row.task_id ?? undefined,
    runId: row.run_id ?? undefined,
    correlationId: row.correlation_id ?? undefined,
    payloadSummary: JSON.parse(String(row.payload_summary_json)),
    payloadRef: row.payload_ref,
    artifactRefs: parseJsonArray(row.artifact_refs_json),
    policyDecisionRefs: parseJsonArray(row.policy_decision_refs_json),
    redactionStatus: row.redaction_status,
    degraded: parseJsonArray(row.degraded_json)
  });
}

export class RunRepository implements RunRepositoryPort {
  constructor(private readonly db: Database.Database) {}

  save(run: Run): Run {
    const parsed = RunSchema.parse(run);
    this.db
      .prepare(
        `INSERT INTO runs (
          run_id, task_id, project_id, agent_id, command_identity, status, started_at, ended_at,
          heartbeat_at, heartbeat_state, worktree_id, context_pack_id, event_stream_id,
          log_artifact_ids_json, artifact_ids_json, quality_gate_ids_json, policy_decision_ids_json,
          summary, failure_reason, final_outcome, terminal_state_recorded_at, redaction_status,
          created_at, updated_at, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id) DO UPDATE SET
          status = excluded.status,
          ended_at = excluded.ended_at,
          heartbeat_at = excluded.heartbeat_at,
          heartbeat_state = excluded.heartbeat_state,
          log_artifact_ids_json = excluded.log_artifact_ids_json,
          artifact_ids_json = excluded.artifact_ids_json,
          quality_gate_ids_json = excluded.quality_gate_ids_json,
          policy_decision_ids_json = excluded.policy_decision_ids_json,
          summary = excluded.summary,
          failure_reason = excluded.failure_reason,
          final_outcome = excluded.final_outcome,
          terminal_state_recorded_at = excluded.terminal_state_recorded_at,
          updated_at = excluded.updated_at`
      )
      .run(
        parsed.runId,
        parsed.taskId,
        parsed.projectId,
        parsed.agentId,
        parsed.commandIdentity,
        parsed.status,
        parsed.startedAt ?? null,
        parsed.endedAt ?? null,
        parsed.heartbeatAt ?? null,
        parsed.heartbeatState,
        parsed.worktreeId ?? null,
        parsed.contextPackId ?? null,
        parsed.eventStreamId ?? null,
        JSON.stringify(parsed.logArtifactIds),
        JSON.stringify(parsed.artifactIds),
        JSON.stringify(parsed.qualityGateIds),
        JSON.stringify(parsed.policyDecisionIds),
        parsed.summary ?? null,
        parsed.failureReason ?? null,
        parsed.finalOutcome ?? null,
        parsed.terminalStateRecordedAt ?? null,
        parsed.redactionStatus,
        parsed.createdAt,
        parsed.updatedAt,
        parsed.schemaVersion
      );
    return parsed;
  }

  get(runId: string): Run | undefined {
    const row = this.db.prepare("SELECT * FROM runs WHERE run_id = ?").get(runId);
    return row ? runFromRow(row as Row) : undefined;
  }

  list(projectId?: string): Run[] {
    const stmt = projectId
      ? this.db.prepare("SELECT * FROM runs WHERE project_id = ? ORDER BY created_at DESC")
      : this.db.prepare("SELECT * FROM runs ORDER BY created_at DESC");
    return (projectId ? stmt.all(projectId) : stmt.all()).map((row) => runFromRow(row as Row));
  }

  appendEvent(event: Omit<RunEvent, "sequence">): RunEvent {
    const sequence = Number(
      (this.db.prepare("SELECT COALESCE(MAX(sequence), -1) + 1 AS sequence FROM events").get() as {
        sequence: number;
      }).sequence
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

  listEvents(runId: string): RunEvent[] {
    return this.db
      .prepare("SELECT * FROM events WHERE run_id = ? ORDER BY sequence ASC")
      .all(runId)
      .map((row) => eventFromRow(row as Row));
  }
}
