/**
 * Audit — migrated from raw LegacyDatabaseHandle to MikroORM EntityManager.
 * ARCH-01/ARCH-02: All DB access via MikroORM EM connection.
 */

import type { EntityManager } from "@mikro-orm/postgresql";
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
  const db = em.getKysely<any>();
  let query = db.selectFrom("audit_events").selectAll().where("org_id", "=", filter.orgId);
  let countQuery = db.selectFrom("audit_events").select((eb: any) => eb.fn.countAll().as("count")).where("org_id", "=", filter.orgId);

  const applyFilters = <T extends { where: (...args: any[]) => T }>(builder: T): T => {
    let next = builder;
    if (filter.projectId) next = next.where("project_id", "=", filter.projectId);
    if (filter.actor) next = next.where("actor_id", "=", filter.actor);
    if (filter.subjectKind) next = next.where("subject_kind", "=", filter.subjectKind);
    if (filter.verb) next = next.where("action", "=", filter.verb);
    if (filter.since) next = next.where("created_at", ">=", filter.since);
    if (filter.until) next = next.where("created_at", "<=", filter.until);
    return next;
  };

  query = applyFilters(query);
  countQuery = applyFilters(countQuery);
  const countRows = await countQuery.execute() as Array<{ count: string | number | bigint }>;
  const total = Number(countRows[0]?.count ?? 0);
  const rows = await query.orderBy("created_at", "desc").orderBy("id", "desc").limit(limit).offset(offset).execute() as Array<Record<string, unknown>>;

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
  created_at: string;
  updated_at?: string;
}

export async function getRetentionPolicy(
  em: EntityManager,
  orgId: string,
  projectId?: string | null,
): Promise<RetentionPolicyRow | null> {
  let query = em.getKysely<any>()
    .selectFrom("event_retention_policy")
    .selectAll()
    .where("org_id", "=", orgId);
  query = projectId ? query.where("project_id", "=", projectId) : query.where("project_id", "is", null);
  const rows = await query.execute() as RetentionPolicyRow[];
  return rows[0] ?? null;
}

export async function upsertRetentionPolicy(
  em: EntityManager,
  orgId: string,
  retainDays: number,
  projectId?: string | null,
): Promise<RetentionPolicyRow> {
  const existing = await getRetentionPolicy(em, orgId, projectId);
  if (existing) {
    const rows = await em.getKysely<any>()
      .updateTable("event_retention_policy")
      .set({ retain_days: retainDays })
      .where("id", "=", existing.id)
      .returningAll()
      .execute() as RetentionPolicyRow[];
    return rows[0] as RetentionPolicyRow;
  }
  const id = randomUUID();
  const rows = await em.getKysely<any>()
    .insertInto("event_retention_policy")
    .values({ id, org_id: orgId, project_id: projectId ?? null, retain_days: retainDays })
    .returningAll()
    .execute() as RetentionPolicyRow[];
  return rows[0] as RetentionPolicyRow;
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
