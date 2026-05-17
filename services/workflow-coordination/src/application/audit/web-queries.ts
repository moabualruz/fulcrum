/**
 * Audit — migrated from raw LegacyDatabaseHandle to TypeORM EntityManager.
 * ARCH-01/ARCH-02: All DB access via TypeORM connection.
 */

import type { EntityManager } from "typeorm";
import { ormSqlConnection } from "@platform-core/application/orm-helpers.ts";
import { randomUUID } from "node:crypto";

export interface EventRow {
  id: string;
  org_id: string;
  project_id: string | null;
  actor: string;
  subject_kind: string;
  subject_id: string;
  verb: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface AuditFilter {
  orgId: string;
  projectId?: string;
  actor?: string;
  subjectKind?: string;
  verb?: string;
  since?: string;
  until?: string;
}

export interface AuditQueryResult {
  rows: EventRow[];
  total: number;
}

/**
 * Query audit events with filters + pagination.
 * Default sort: created_at DESC.
 */
export async function queryAuditEvents(
  em: EntityManager,
  filter: AuditFilter,
  opts: { limit?: number; offset?: number } = {},
): Promise<AuditQueryResult> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const conn = ormSqlConnection(em);
  const { whereSql, params } = buildAuditWhere(filter);
  const countRows = await conn.execute<Array<{ count: string | number | bigint }>>(
    `SELECT count(*) AS count
       FROM audit_events
      ${whereSql}`,
    params,
  );
  const total = Number(countRows[0]?.count ?? 0);
  const rows = await conn.execute<Array<Record<string, unknown>>>(
    `SELECT *
       FROM audit_events
      ${whereSql}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );

  return { rows: rows.map(toEventRow), total };
}

/**
 * Export audit events as CSV string.
 */
export function eventsToCsv(events: EventRow[]): string {
  const headers = ["id", "org_id", "project_id", "actor", "subject_kind", "subject_id", "verb", "payload", "created_at"];
  const lines = [headers.join(",")];
  for (const e of events) {
    const row = [
      e.id,
      e.org_id,
      e.project_id ?? "",
      e.actor,
      e.subject_kind,
      e.subject_id,
      e.verb,
      `"${JSON.stringify(e.payload ?? {}).replace(/"/g, '""')}"`,
      e.created_at,
    ];
    lines.push(row.join(","));
  }
  return lines.join("\n") + "\n";
}

/**
 * Export audit events as JSON string.
 */
export function eventsToJson(events: EventRow[]): string {
  return JSON.stringify(events);
}

// --- Retention policy ---

export interface RetentionPolicyRow {
  id: string;
  org_id: string;
  project_id: string | null;
  retain_days: number;
  created_at?: string;
  updated_at?: string;
}

export async function getRetentionPolicy(
  em: EntityManager,
  orgId: string,
  projectId?: string | null,
): Promise<RetentionPolicyRow | null> {
  const rows = await ormSqlConnection(em).execute<RetentionPolicyRow[]>(
    `SELECT id, org_id, project_id, retain_days
       FROM event_retention_policy
      WHERE org_id = $1
        AND ${projectId ? "project_id = $2" : "project_id IS NULL"}
      LIMIT 1`,
    projectId ? [orgId, projectId] : [orgId],
  );
  return rows[0] ?? null;
}

export async function upsertRetentionPolicy(
  em: EntityManager,
  orgId: string,
  retainDays: number,
  projectId?: string | null,
): Promise<RetentionPolicyRow> {
  const existing = await getRetentionPolicy(em, orgId, projectId);
  const conn = ormSqlConnection(em);
  if (existing) {
    const rows = await conn.execute<RetentionPolicyRow[]>(
      `UPDATE event_retention_policy
          SET retain_days = $1
        WHERE id = $2
        RETURNING id, org_id, project_id, retain_days`,
      [retainDays, existing.id],
    );
    return rows[0] as RetentionPolicyRow;
  }
  const id = randomUUID();
  const rows = await conn.execute<RetentionPolicyRow[]>(
    `INSERT INTO event_retention_policy (id, org_id, project_id, retain_days)
     VALUES ($1, $2, $3, $4)
     RETURNING id, org_id, project_id, retain_days`,
    [id, orgId, projectId ?? null, retainDays],
  );
  return rows[0] as RetentionPolicyRow;
}

function buildAuditWhere(filter: AuditFilter): { whereSql: string; params: unknown[] } {
  const clauses = ["org_id = $1"];
  const params: unknown[] = [filter.orgId];
  const add = (column: string, operator: string, value: unknown) => {
    params.push(value);
    clauses.push(`${column} ${operator} $${params.length}`);
  };
  if (filter.projectId) add("project_id", "=", filter.projectId);
  if (filter.actor) add("actor_id", "=", filter.actor);
  if (filter.subjectKind) add("subject_kind", "=", filter.subjectKind);
  if (filter.verb) add("action", "=", filter.verb);
  if (filter.since) add("created_at", ">=", filter.since);
  if (filter.until) add("created_at", "<=", filter.until);
  return { whereSql: `WHERE ${clauses.join(" AND ")}`, params };
}

function toEventRow(row: Record<string, unknown>): EventRow {
  const projectId = row["project_id"];
  const payload = row["payload"] ?? {};
  return {
    id: String(row["id"]),
    org_id: String(row["org_id"]),
    project_id: projectId ? String(projectId) : null,
    actor: String(row["actor_id"] ?? ""),
    subject_kind: String(row["subject_kind"]),
    subject_id: String(row["subject_id"]),
    verb: String(row["action"]),
    payload: typeof payload === "string" ? JSON.parse(payload) : payload as Record<string, unknown>,
    created_at: new Date(row["created_at"] as string | Date).toISOString(),
  };
}
