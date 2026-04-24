import type Database from "better-sqlite3";
import { GraphLinkSchema, type GraphLink } from "@fulcrum/shared";

type Row = Record<string, unknown>;

function parseJson<T>(value: unknown, fallback: T): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : fallback;
}

function fromRow(row: Row): GraphLink {
  return GraphLinkSchema.parse({
    graphLinkId: row.graph_link_id,
    projectId: row.project_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    targetType: row.target_type,
    targetId: row.target_id,
    relation: row.relation,
    sourceRef: parseJson(row.source_ref_json, {}),
    targetRef: parseJson(row.target_ref_json, {}),
    evidenceRef: row.evidence_ref_json ? parseJson(row.evidence_ref_json, undefined) : undefined,
    reason: row.reason,
    freshness: row.freshness,
    limitation: row.limitation ?? undefined,
    confidence: row.confidence ?? undefined,
    derived: Boolean(row.derived),
    redactionStatus: row.redaction_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schemaVersion: row.schema_version
  });
}

export class GraphLinkRepository {
  constructor(private readonly db: Database.Database) {}

  save(link: GraphLink): GraphLink {
    const parsed = GraphLinkSchema.parse(link);
    this.db
      .prepare(
        `INSERT INTO graph_links (
          graph_link_id, project_id, source_type, source_id, target_type, target_id, relation,
          source_ref_json, target_ref_json, evidence_ref_json, reason, freshness, limitation,
          confidence, derived, redaction_status, created_at, updated_at, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(graph_link_id) DO UPDATE SET
          relation = excluded.relation,
          source_ref_json = excluded.source_ref_json,
          target_ref_json = excluded.target_ref_json,
          evidence_ref_json = excluded.evidence_ref_json,
          reason = excluded.reason,
          freshness = excluded.freshness,
          limitation = excluded.limitation,
          confidence = excluded.confidence,
          derived = excluded.derived,
          redaction_status = excluded.redaction_status,
          updated_at = excluded.updated_at,
          schema_version = excluded.schema_version`
      )
      .run(
        parsed.graphLinkId,
        parsed.projectId,
        parsed.sourceType,
        parsed.sourceId,
        parsed.targetType,
        parsed.targetId,
        parsed.relation,
        JSON.stringify(parsed.sourceRef),
        JSON.stringify(parsed.targetRef),
        parsed.evidenceRef ? JSON.stringify(parsed.evidenceRef) : null,
        parsed.reason,
        parsed.freshness,
        parsed.limitation ?? null,
        parsed.confidence ?? null,
        parsed.derived ? 1 : 0,
        parsed.redactionStatus,
        parsed.createdAt,
        parsed.updatedAt,
        parsed.schemaVersion
      );
    return parsed;
  }

  list(projectId?: string): GraphLink[] {
    const statement = projectId
      ? this.db.prepare("SELECT * FROM graph_links WHERE project_id = ? ORDER BY updated_at DESC")
      : this.db.prepare("SELECT * FROM graph_links ORDER BY updated_at DESC");
    return (projectId ? statement.all(projectId) : statement.all()).map((row) =>
      fromRow(row as Row)
    );
  }

  listForNode(type: string, id: string): GraphLink[] {
    return this.db
      .prepare(
        `SELECT * FROM graph_links
         WHERE (source_type = ? AND source_id = ?) OR (target_type = ? AND target_id = ?)
         ORDER BY updated_at DESC`
      )
      .all(type, id, type, id)
      .map((row) => fromRow(row as Row));
  }

  replaceDerived(projectId: string, links: GraphLink[]): GraphLink[] {
    const parsed = links.map((link) => GraphLinkSchema.parse(link));
    const tx = this.db.transaction((rows: GraphLink[]) => {
      this.db
        .prepare("DELETE FROM graph_links WHERE project_id = ? AND derived = 1")
        .run(projectId);
      for (const row of rows) this.save(row);
    });
    tx(parsed);
    return parsed;
  }
}
