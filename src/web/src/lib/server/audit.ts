import type { ProductDb } from "@fulcrum/product-kernel/db/types.ts";
import type { EventRow } from "@fulcrum/product-kernel/store/repositories.ts";
import { newUlid } from "@fulcrum/product-kernel/ids.ts";

export interface AuditFilter {
  orgId: string;
  projectId?: string;
  actor?: string;
  subjectKind?: string;
  verb?: string;
  since?: string; // ISO date
  until?: string; // ISO date
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
  db: ProductDb,
  filter: AuditFilter,
  opts: { limit?: number; offset?: number } = {},
): Promise<AuditQueryResult> {
  const conditions: string[] = ["org_id = $1"];
  const params: unknown[] = [filter.orgId];
  let idx = 2;

  if (filter.projectId) {
    conditions.push(`project_id = $${idx++}`);
    params.push(filter.projectId);
  }
  if (filter.actor) {
    conditions.push(`actor = $${idx++}`);
    params.push(filter.actor);
  }
  if (filter.subjectKind) {
    conditions.push(`subject_kind = $${idx++}`);
    params.push(filter.subjectKind);
  }
  if (filter.verb) {
    conditions.push(`verb = $${idx++}`);
    params.push(filter.verb);
  }
  if (filter.since) {
    conditions.push(`created_at >= $${idx++}`);
    params.push(filter.since);
  }
  if (filter.until) {
    conditions.push(`created_at <= $${idx++}`);
    params.push(filter.until);
  }

  const where = conditions.join(" AND ");

  const countRows = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM events WHERE ${where}`,
    params,
  );
  const total = parseInt(countRows[0]?.count ?? "0", 10);

  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const rows = await db.query<EventRow>(
    `SELECT * FROM events WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset],
  );

  return { rows, total };
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
  updated_at: string;
}

export async function getRetentionPolicy(
  db: ProductDb,
  orgId: string,
  projectId?: string | null,
): Promise<RetentionPolicyRow | null> {
  const rows = await db.query<RetentionPolicyRow>(
    projectId
      ? `SELECT * FROM event_retention_policies WHERE org_id = $1 AND project_id = $2`
      : `SELECT * FROM event_retention_policies WHERE org_id = $1 AND project_id IS NULL`,
    projectId ? [orgId, projectId] : [orgId],
  );
  return rows[0] ?? null;
}

export async function upsertRetentionPolicy(
  db: ProductDb,
  orgId: string,
  retainDays: number,
  projectId?: string | null,
): Promise<RetentionPolicyRow> {
  const existing = await getRetentionPolicy(db, orgId, projectId);
  if (existing) {
    await db.query(
      `UPDATE event_retention_policies SET retain_days = $1, updated_at = now() WHERE id = $2`,
      [retainDays, existing.id],
    );
    const rows = await db.query<RetentionPolicyRow>(
      `SELECT * FROM event_retention_policies WHERE id = $1`,
      [existing.id],
    );
    return rows[0] as RetentionPolicyRow;
  }
  const id = newUlid();
  await db.query(
    `INSERT INTO event_retention_policies (id, org_id, project_id, retain_days) VALUES ($1, $2, $3, $4)`,
    [id, orgId, projectId ?? null, retainDays],
  );
  const rows = await db.query<RetentionPolicyRow>(
    `SELECT * FROM event_retention_policies WHERE id = $1`,
    [id],
  );
  return rows[0] as RetentionPolicyRow;
}
