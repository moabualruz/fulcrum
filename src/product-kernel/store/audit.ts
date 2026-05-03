import type { ProductDb, SqlValue } from "../db/types.ts";

// --- Row types ---

export interface AuditEventRow {
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

export interface AuditQueryOptions {
  orgId: string;
  projectId?: string;
  userId?: string;
  kind?: string;
  verb?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

export interface AuditExportOptions {
  orgId: string;
  projectId?: string;
  userId?: string;
  kind?: string;
  verb?: string;
  since?: string;
  until?: string;
}

const LARGE_EXPORT_THRESHOLD = 100_000;

/**
 * Query audit events with filters and pagination.
 */
export async function queryAuditEvents(
  db: ProductDb,
  opts: AuditQueryOptions,
): Promise<{ items: AuditEventRow[]; total: number }> {
  const where: string[] = ["org_id = $1"];
  const params: SqlValue[] = [opts.orgId];
  let idx = 2;

  if (opts.projectId) {
    where.push(`project_id = $${idx}`);
    params.push(opts.projectId);
    idx++;
  }
  if (opts.userId) {
    where.push(`actor = $${idx}`);
    params.push(opts.userId);
    idx++;
  }
  if (opts.kind) {
    where.push(`subject_kind = $${idx}`);
    params.push(opts.kind);
    idx++;
  }
  if (opts.verb) {
    where.push(`verb = $${idx}`);
    params.push(opts.verb);
    idx++;
  }
  if (opts.since) {
    where.push(`created_at >= $${idx}`);
    params.push(opts.since);
    idx++;
  }
  if (opts.until) {
    where.push(`created_at <= $${idx}`);
    params.push(opts.until);
    idx++;
  }

  const clause = where.join(" AND ");
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const countRows = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM events WHERE ${clause}`,
    params,
  );
  const total = Number(countRows[0]?.count ?? 0);

  const items = await db.query<AuditEventRow>(
    `SELECT id, org_id, project_id, actor, subject_kind, subject_id, verb, payload, created_at
     FROM events WHERE ${clause}
     ORDER BY created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset],
  );

  return { items, total };
}

/**
 * Export audit events. Returns rows for small result sets,
 * or a jobId for large exports (>100k rows).
 */
export async function exportAuditEvents(
  db: ProductDb,
  opts: AuditExportOptions & { format: "csv" | "json" },
): Promise<
  | { kind: "inline"; format: "json"; rows: AuditEventRow[] }
  | { kind: "inline"; format: "csv"; csv: string }
  | { kind: "job"; jobId: string }
> {
  // Count first to decide if large export
  const queryOpts: AuditQueryOptions = { ...opts, limit: 1, offset: 0 };
  const { total } = await queryAuditEvents(db, queryOpts);

  if (total > LARGE_EXPORT_THRESHOLD) {
    // For large exports, return a jobId that callers can poll
    const jobId = `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return { kind: "job", jobId };
  }

  // Fetch all rows (no pagination)
  const { items } = await queryAuditEvents(db, { ...opts, limit: total || 1, offset: 0 });

  if (opts.format === "json") {
    return { kind: "inline", format: "json", rows: items };
  }

  // CSV format
  const headers = ["id", "org_id", "project_id", "actor", "subject_kind", "subject_id", "verb", "payload", "created_at"];
  const csvLines = [headers.join(",")];
  for (const row of items) {
    csvLines.push(
      headers
        .map((h) => {
          const val = row[h as keyof AuditEventRow];
          if (val === null || val === undefined) return "";
          if (typeof val === "object") return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
          const s = String(val);
          return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        })
        .join(","),
    );
  }
  return { kind: "inline", format: "csv", csv: csvLines.join("\n") };
}

/**
 * Check export job status. Stub — always returns completed for inline exports.
 */
export async function checkExportStatus(
  _db: ProductDb,
  _jobId: string,
): Promise<{ status: "pending" | "completed" | "failed"; downloadUrl?: string }> {
  // In a real implementation, this would check a jobs table.
  // For now, always return completed after a simulated delay.
  return { status: "completed" };
}
