import type Database from "better-sqlite3";
import { CodeEvidenceSchema, type CodeEvidence } from "@fulcrum/shared";

type CodeEvidenceRow = Record<string, unknown>;

function fromRow(row: CodeEvidenceRow): CodeEvidence {
  return CodeEvidenceSchema.parse({
    evidenceId: row.evidence_id,
    projectId: row.project_id,
    query: row.query,
    evidenceType: row.evidence_type,
    filePath: row.file_path,
    lineStart: row.line_start ?? undefined,
    lineEnd: row.line_end ?? undefined,
    symbol: row.symbol ?? undefined,
    sourceTool: row.source_tool,
    ignoredPathStatus: row.ignored_path_status,
    freshness: row.freshness,
    rank: row.rank,
    reason: row.reason,
    durationMs: row.duration_ms,
    linkedContextItemIds:
      typeof row.linked_context_item_ids_json === "string"
        ? (JSON.parse(row.linked_context_item_ids_json) as string[])
        : [],
    createdAt: row.created_at,
    staleAt: row.stale_at ?? undefined
  });
}

export class CodeEvidenceRepository {
  constructor(private readonly db: Database.Database) {}

  save(evidence: CodeEvidence): CodeEvidence {
    const parsed = CodeEvidenceSchema.parse(evidence);
    this.db
      .prepare(
        `INSERT INTO code_evidence (
          evidence_id, project_id, query, evidence_type, file_path, line_start, line_end,
          symbol, source_tool, ignored_path_status, freshness, rank, reason, duration_ms,
          linked_context_item_ids_json, created_at, stale_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(evidence_id) DO UPDATE SET
          freshness = excluded.freshness,
          rank = excluded.rank,
          reason = excluded.reason,
          duration_ms = excluded.duration_ms,
          linked_context_item_ids_json = excluded.linked_context_item_ids_json,
          stale_at = excluded.stale_at`
      )
      .run(
        parsed.evidenceId,
        parsed.projectId,
        parsed.query,
        parsed.evidenceType,
        parsed.filePath,
        parsed.lineStart ?? null,
        parsed.lineEnd ?? null,
        parsed.symbol ?? null,
        parsed.sourceTool,
        parsed.ignoredPathStatus,
        parsed.freshness,
        parsed.rank,
        parsed.reason,
        parsed.durationMs,
        JSON.stringify(parsed.linkedContextItemIds),
        parsed.createdAt,
        parsed.staleAt ?? null
      );
    return parsed;
  }

  list(projectId: string): CodeEvidence[] {
    return this.db
      .prepare("SELECT * FROM code_evidence WHERE project_id = ? ORDER BY rank ASC")
      .all(projectId)
      .map((row) => fromRow(row as CodeEvidenceRow));
  }

  markStale(evidenceId: string, staleAt: string): CodeEvidence | undefined {
    this.db
      .prepare("UPDATE code_evidence SET freshness = 'stale', stale_at = ? WHERE evidence_id = ?")
      .run(staleAt, evidenceId);
    const row = this.db
      .prepare("SELECT * FROM code_evidence WHERE evidence_id = ?")
      .get(evidenceId);
    return row ? fromRow(row as CodeEvidenceRow) : undefined;
  }
}
