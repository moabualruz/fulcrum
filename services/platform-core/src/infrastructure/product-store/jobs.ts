import type { ProductDb } from "./db/types.ts";
import { newUlid } from "./ids.ts";

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface JobRow {
  id: string;
  org_id: string;
  project_id: string | null;
  trace_id: string | null;
  queue: string;
  kind: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  available_at: string;
  locked_by: string | null;
  locked_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnqueueJobInput {
  orgId: string;
  projectId?: string | null;
  traceId?: string | null;
  queue: string;
  kind: string;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
  availableAt?: Date;
}

export async function enqueueJob(db: ProductDb, input: EnqueueJobInput): Promise<JobRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO jobs
       (id, org_id, project_id, trace_id, queue, kind, payload, status, max_attempts, available_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'queued', $8, $9)`,
    [
      id,
      input.orgId,
      input.projectId ?? null,
      input.traceId ?? null,
      input.queue,
      input.kind,
      JSON.stringify(input.payload ?? {}),
      input.maxAttempts ?? 3,
      (input.availableAt ?? new Date()).toISOString(),
    ],
  );
  return (await getJob(db, id)) as JobRow;
}

export async function getJob(db: ProductDb, id: string): Promise<JobRow | null> {
  const rows = await db.query<JobRow>(`SELECT * FROM jobs WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

// PGlite path: single-process transaction, claim row by id then update.
// PostgreSQL path: same query is wrapped in `FOR UPDATE SKIP LOCKED`.
export async function claimJob(
  db: ProductDb,
  queue: string,
  worker: string,
): Promise<JobRow | null> {
  const lockClause = db.engine === "postgres" ? "FOR UPDATE SKIP LOCKED" : "";
  const rows = await db.query<{ id: string }>(
    `SELECT id FROM jobs
       WHERE queue = $1 AND status = 'queued' AND available_at <= now()
       ORDER BY available_at ASC, created_at ASC, id ASC
       LIMIT 1
       ${lockClause}`,
    [queue],
  );
  const id = rows[0]?.id;
  if (!id) return null;
  const updated = await db.query<JobRow>(
    `UPDATE jobs
        SET status = 'running',
            attempts = attempts + 1,
            locked_by = $2,
            locked_at = now(),
            updated_at = now()
      WHERE id = $1 AND status = 'queued'
      RETURNING *`,
    [id, worker],
  );
  return updated[0] ?? null;
}

export async function completeJob(db: ProductDb, id: string): Promise<void> {
  await db.query(
    `UPDATE jobs SET status = 'succeeded', locked_by = NULL, locked_at = NULL, updated_at = now()
      WHERE id = $1`,
    [id],
  );
}

export async function failJob(db: ProductDb, id: string, error: string): Promise<JobRow | null> {
  const rows = await db.query<JobRow>(
    `UPDATE jobs
        SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
            locked_by = NULL,
            locked_at = NULL,
            last_error = $2,
            available_at = now(),
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [id, error],
  );
  return rows[0] ?? null;
}

export async function cancelJob(db: ProductDb, id: string): Promise<void> {
  await db.query(
    `UPDATE jobs SET status = 'cancelled', locked_by = NULL, locked_at = NULL, updated_at = now()
      WHERE id = $1`,
    [id],
  );
}
