import type Database from "better-sqlite3";
import {
  QualityGateDefinitionSchema,
  QualityGateResultSchema,
  type QualityGateDefinition,
  type QualityGateResult
} from "@fulcrum/shared";

type Row = Record<string, unknown>;

function definitionFromRow(row: Row): QualityGateDefinition {
  return QualityGateDefinitionSchema.parse({
    gateId: row.gate_id,
    projectId: row.project_id,
    name: row.name,
    command: row.command,
    required: Boolean(row.required),
    timeoutMs: row.timeout_ms ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schemaVersion: row.schema_version
  });
}

function resultFromRow(row: Row): QualityGateResult {
  return QualityGateResultSchema.parse({
    qualityGateResultId: row.quality_gate_result_id,
    gateId: row.gate_id,
    projectId: row.project_id,
    taskId: row.task_id ?? undefined,
    runId: row.run_id ?? undefined,
    workingDirectory: row.working_directory ?? undefined,
    status: row.status,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    outputArtifactId: row.output_artifact_id ?? undefined,
    parsedSummary: JSON.parse(String(row.parsed_summary_json)),
    redactionStatus: row.redaction_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schemaVersion: row.schema_version
  });
}

export class QualityGateRepository {
  constructor(private readonly db: Database.Database) {}

  saveDefinition(definition: QualityGateDefinition): QualityGateDefinition {
    const parsed = QualityGateDefinitionSchema.parse(definition);
    this.db
      .prepare(
        `INSERT INTO quality_gates (
          gate_id, project_id, name, command, required, timeout_ms, created_at, updated_at, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(gate_id) DO UPDATE SET
          name = excluded.name,
          command = excluded.command,
          required = excluded.required,
          timeout_ms = excluded.timeout_ms,
          updated_at = excluded.updated_at`
      )
      .run(
        parsed.gateId,
        parsed.projectId,
        parsed.name,
        parsed.command,
        parsed.required ? 1 : 0,
        parsed.timeoutMs ?? null,
        parsed.createdAt,
        parsed.updatedAt,
        parsed.schemaVersion
      );
    return parsed;
  }

  getDefinition(gateId: string): QualityGateDefinition | undefined {
    const row = this.db.prepare("SELECT * FROM quality_gates WHERE gate_id = ?").get(gateId);
    return row ? definitionFromRow(row as Row) : undefined;
  }

  listDefinitions(projectId: string): QualityGateDefinition[] {
    return this.db
      .prepare("SELECT * FROM quality_gates WHERE project_id = ? ORDER BY name ASC")
      .all(projectId)
      .map((row) => definitionFromRow(row as Row));
  }

  saveResult(result: QualityGateResult): QualityGateResult {
    const parsed = QualityGateResultSchema.parse(result);
    this.db
      .prepare(
        `INSERT INTO quality_gate_results (
          quality_gate_result_id, gate_id, project_id, task_id, run_id, working_directory, status, started_at,
          completed_at, duration_ms, output_artifact_id, parsed_summary_json, redaction_status,
          created_at, updated_at, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(quality_gate_result_id) DO UPDATE SET
          working_directory = excluded.working_directory,
          status = excluded.status,
          completed_at = excluded.completed_at,
          duration_ms = excluded.duration_ms,
          output_artifact_id = excluded.output_artifact_id,
          parsed_summary_json = excluded.parsed_summary_json,
          redaction_status = excluded.redaction_status,
          updated_at = excluded.updated_at`
      )
      .run(
        parsed.qualityGateResultId,
        parsed.gateId,
        parsed.projectId,
        parsed.taskId ?? null,
        parsed.runId ?? null,
        parsed.workingDirectory ?? null,
        parsed.status,
        parsed.startedAt ?? null,
        parsed.completedAt ?? null,
        parsed.durationMs ?? null,
        parsed.outputArtifactId ?? null,
        JSON.stringify(parsed.parsedSummary),
        parsed.redactionStatus,
        parsed.createdAt,
        parsed.updatedAt,
        parsed.schemaVersion
      );
    return parsed;
  }

  getResult(resultId: string): QualityGateResult | undefined {
    const row = this.db
      .prepare("SELECT * FROM quality_gate_results WHERE quality_gate_result_id = ?")
      .get(resultId);
    return row ? resultFromRow(row as Row) : undefined;
  }

  listResults(input: { projectId: string; runId?: string; taskId?: string }): QualityGateResult[] {
    const clauses = ["project_id = ?"];
    const params: string[] = [input.projectId];
    if (input.runId) {
      clauses.push("run_id = ?");
      params.push(input.runId);
    }
    if (input.taskId) {
      clauses.push("task_id = ?");
      params.push(input.taskId);
    }
    return this.db
      .prepare(
        `SELECT * FROM quality_gate_results WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC`
      )
      .all(...params)
      .map((row) => resultFromRow(row as Row));
  }
}
