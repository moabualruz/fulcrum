import type Database from "better-sqlite3";
import {
  ContextItemSchema,
  ContextPackSchema,
  type ContextItem,
  type ContextPack
} from "@fulcrum/shared";

type Row = Record<string, unknown>;

interface ContextPackRepositoryPort {
  savePack(pack: ContextPack): ContextPack;
  saveItems(items: ContextItem[]): ContextItem[];
  getPack(contextPackId: string): ContextPack | undefined;
  listItems(contextPackId: string): ContextItem[];
}

function parseJson<T>(value: unknown, fallback: T): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : fallback;
}

function packFromRow(row: Row): ContextPack {
  return ContextPackSchema.parse({
    contextPackId: row.context_pack_id,
    projectId: row.project_id,
    taskId: row.task_id,
    runId: row.run_id ?? undefined,
    status: row.status,
    generatedAt: row.generated_at ?? undefined,
    budget: row.budget,
    budgetUsed: row.budget_used,
    laneSummaries: parseJson(row.lane_summaries_json, []),
    omissions: parseJson(row.omissions_json, []),
    degradedLanes: parseJson(row.degraded_lanes_json, []),
    freshness: row.freshness ?? undefined,
    exportRefs: parseJson(row.export_refs_json, []),
    policyDecisionIds: parseJson(row.policy_decision_ids_json, []),
    redactionStatus: row.redaction_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schemaVersion: row.schema_version
  });
}

function itemFromRow(row: Row): ContextItem {
  return ContextItemSchema.parse({
    contextItemId: row.context_item_id,
    contextPackId: row.context_pack_id,
    lane: row.lane,
    type: row.type,
    sourceRef: parseJson(row.source_ref_json, {}),
    title: row.title,
    excerptRef: row.excerpt_ref ?? undefined,
    inclusionReason: row.inclusion_reason,
    freshness: row.freshness,
    evidenceType: row.evidence_type,
    confidence: row.confidence ?? undefined,
    limitation: row.limitation ?? undefined,
    toolIdentity: row.tool_identity ?? undefined,
    budgetEstimate: row.budget_estimate,
    rank: row.rank,
    redactionStatus: row.redaction_status,
    linkedRefs: parseJson(row.linked_refs_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schemaVersion: row.schema_version
  });
}

export class ContextPackRepository implements ContextPackRepositoryPort {
  constructor(private readonly db: Database.Database) {}

  savePack(pack: ContextPack): ContextPack {
    const parsed = ContextPackSchema.parse(pack);
    this.db
      .prepare(
        `INSERT INTO context_packs (
          context_pack_id, project_id, task_id, run_id, status, generated_at, budget,
          budget_used, lane_summaries_json, omissions_json, degraded_lanes_json, freshness,
          export_refs_json, policy_decision_ids_json, redaction_status, created_at, updated_at,
          schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(context_pack_id) DO UPDATE SET
          status = excluded.status,
          generated_at = excluded.generated_at,
          budget_used = excluded.budget_used,
          lane_summaries_json = excluded.lane_summaries_json,
          omissions_json = excluded.omissions_json,
          degraded_lanes_json = excluded.degraded_lanes_json,
          freshness = excluded.freshness,
          export_refs_json = excluded.export_refs_json,
          policy_decision_ids_json = excluded.policy_decision_ids_json,
          redaction_status = excluded.redaction_status,
          updated_at = excluded.updated_at,
          schema_version = excluded.schema_version`
      )
      .run(
        parsed.contextPackId,
        parsed.projectId,
        parsed.taskId,
        parsed.runId ?? null,
        parsed.status,
        parsed.generatedAt ?? null,
        parsed.budget,
        parsed.budgetUsed,
        JSON.stringify(parsed.laneSummaries),
        JSON.stringify(parsed.omissions),
        JSON.stringify(parsed.degradedLanes),
        parsed.freshness ?? null,
        JSON.stringify(parsed.exportRefs),
        JSON.stringify(parsed.policyDecisionIds),
        parsed.redactionStatus,
        parsed.createdAt,
        parsed.updatedAt,
        parsed.schemaVersion
      );
    return parsed;
  }

  saveItems(items: ContextItem[]): ContextItem[] {
    const parsed = items.map((item) => ContextItemSchema.parse(item));
    const statement = this.db.prepare(
      `INSERT INTO context_items (
        context_item_id, context_pack_id, lane, type, source_ref_json, title, excerpt_ref,
        inclusion_reason, freshness, evidence_type, confidence, limitation, tool_identity,
        budget_estimate, rank, redaction_status, linked_refs_json, created_at, updated_at,
        schema_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(context_item_id) DO UPDATE SET
        rank = excluded.rank,
        redaction_status = excluded.redaction_status,
        updated_at = excluded.updated_at`
    );
    const deleteStatement = this.db.prepare("DELETE FROM context_items WHERE context_pack_id = ?");
    const tx = this.db.transaction((rows: ContextItem[]) => {
      for (const contextPackId of new Set(rows.map((item) => item.contextPackId))) {
        deleteStatement.run(contextPackId);
      }
      for (const item of rows) {
        statement.run(
          item.contextItemId,
          item.contextPackId,
          item.lane,
          item.type,
          JSON.stringify(item.sourceRef),
          item.title,
          item.excerptRef ?? null,
          item.inclusionReason,
          item.freshness,
          item.evidenceType,
          item.confidence ?? null,
          item.limitation ?? null,
          item.toolIdentity ?? null,
          item.budgetEstimate,
          item.rank,
          item.redactionStatus,
          JSON.stringify(item.linkedRefs),
          item.createdAt,
          item.updatedAt,
          item.schemaVersion
        );
      }
    });
    tx(parsed);
    return parsed;
  }

  getPack(contextPackId: string): ContextPack | undefined {
    const row = this.db
      .prepare("SELECT * FROM context_packs WHERE context_pack_id = ?")
      .get(contextPackId);
    return row ? packFromRow(row as Row) : undefined;
  }

  listItems(contextPackId: string): ContextItem[] {
    return this.db
      .prepare("SELECT * FROM context_items WHERE context_pack_id = ? ORDER BY rank ASC")
      .all(contextPackId)
      .map((row) => itemFromRow(row as Row));
  }
}
