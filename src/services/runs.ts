/**
 * Agent-run service — pure DB operations for dispatching/cancelling/retrying runs.
 * Canonical home; web layer re-exports from here.
 * Dependency direction: services -> product-kernel (never web).
 */
import type { DbHandle } from "../product-kernel/store/repositories.ts";
import { eventDispatcher } from "../product-kernel/event-dispatcher.ts";
import { newUlid } from "../product-kernel/ids.ts";

export type RunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface DispatchRunInput {
  orgId: string;
  projectId?: string | null;
  taskId: string;
  agent: string;
  model?: string | null;
  prompt?: string | null;
}

interface RunScopeRow {
  org_id: string;
  project_id: string | null;
}

interface RunSourceRow {
  id: string;
  org_id: string;
  project_id: string | null;
  agent: string;
  model: string | null;
  prompt: string | null;
}

/** Resolve EntityManager from DbHandle (mirrors repositories.ts pattern). */
function assertEm(db: DbHandle) {
  if ("persist" in db && typeof (db as { persist: unknown }).persist === "function") {
    return db as import("@mikro-orm/postgresql").EntityManager;
  }
  if ("em" in db) {
    const em = (db as { em?: unknown }).em;
    if (em && typeof (em as { persist?: unknown }).persist === "function") {
      return em as import("@mikro-orm/postgresql").EntityManager;
    }
  }
  throw new Error("runs.ts: EntityManager required — pass em instead of raw ProductDb.");
}

function isProductDb(db: DbHandle): db is import("../product-kernel/db/types.ts").ProductDb {
  return !("em" in db) && "query" in db && typeof (db as { query: unknown }).query === "function";
}

export async function dispatchRunAction(
  db: DbHandle,
  input: DispatchRunInput,
): Promise<{ id: string; task_id: string; agent: string; status: RunStatus }> {
  if (isProductDb(db)) {
    const id = newUlid();
    await db.query(
      `INSERT INTO agent_runs
         (id, org_id, project_id, task_id, agent, model, prompt, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued')`,
      [id, input.orgId, input.projectId ?? null, input.taskId, input.agent, input.model ?? null, input.prompt ?? null],
    );
    const jobId = newUlid();
    await db.query(
      `INSERT INTO jobs
         (id, org_id, project_id, queue, kind, payload, status, max_attempts, available_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'queued', $7, $8)`,
      [jobId, input.orgId, input.projectId ?? null, "agent-runs", "agent_run", JSON.stringify({ run_id: id }), 3, new Date().toISOString()],
    );
    await eventDispatcher.dispatch(db, {
      orgId: input.orgId,
      projectId: input.projectId ?? null,
      actor: "system",
      subjectKind: "agent_run",
      subjectId: id,
      verb: "dispatched",
      payload: { task_id: input.taskId, agent: input.agent },
    });
    return { id, task_id: input.taskId, agent: input.agent, status: "queued" };
  }
  const em = assertEm(db);
  const conn = em.getConnection();
  const id = newUlid();

  await conn.execute(
    `INSERT INTO agent_runs
       (id, org_id, project_id, task_id, agent, model, prompt, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'queued')`,
    [
      id,
      input.orgId,
      input.projectId ?? null,
      input.taskId,
      input.agent,
      input.model ?? null,
      input.prompt ?? null,
    ],
  );

  // Inline job enqueue via EntityManager connection (enqueueJob takes ProductDb)
  const jobId = newUlid();
  await conn.execute(
    `INSERT INTO jobs
       (id, org_id, project_id, queue, kind, payload, status, max_attempts, available_at)
     VALUES (?, ?, ?, ?, ?, ?::jsonb, 'queued', ?, ?)`,
    [
      jobId,
      input.orgId,
      input.projectId ?? null,
      "agent-runs",
      "agent_run",
      JSON.stringify({ run_id: id }),
      3,
      new Date().toISOString(),
    ],
  );

  await eventDispatcher.dispatch(db, {
    orgId: input.orgId,
    projectId: input.projectId ?? null,
    actor: "system",
    subjectKind: "agent_run",
    subjectId: id,
    verb: "dispatched",
    payload: { task_id: input.taskId, agent: input.agent },
  });

  return { id, task_id: input.taskId, agent: input.agent, status: "queued" };
}

export async function cancelRunAction(
  db: DbHandle,
  id: string,
  orgId: string,
): Promise<{ ok: boolean }> {
  const em = assertEm(db);
  const conn = em.getConnection();
  const rows = await conn.execute(
    `UPDATE agent_runs
        SET status = 'cancelled', ended_at = now()
      WHERE id = ? AND org_id = ? AND status IN ('queued', 'running')
      RETURNING org_id, project_id`,
    [id, orgId],
  ) as Array<RunScopeRow>;
  const row = rows[0];
  if (row) {
    await eventDispatcher.dispatch(db, {
      orgId: row.org_id,
      projectId: row.project_id,
      actor: "system",
      subjectKind: "agent_run",
      subjectId: id,
      verb: "cancelled",
    });
  }
  return { ok: true };
}

export async function retryRunAction(
  db: DbHandle,
  id: string,
  orgId: string,
): Promise<{ id: string }> {
  const em = assertEm(db);
  const conn = em.getConnection();
  const sourceRows = await conn.execute(
    `SELECT id, org_id, project_id, agent, model, prompt
       FROM agent_runs WHERE id = ? AND org_id = ?`,
    [id, orgId],
  ) as Array<RunSourceRow>;
  const source = sourceRows[0];
  if (!source) throw new Error(`retryRunAction: run not found: ${id}`);

  const newId = newUlid();
  await conn.execute(
    `INSERT INTO agent_runs
       (id, org_id, project_id, agent, model, prompt, status, parent_run_id)
     VALUES (?, ?, ?, ?, ?, ?, 'queued', ?)`,
    [newId, source.org_id, source.project_id, source.agent, source.model, source.prompt, id],
  );

  // Inline job enqueue via EntityManager connection
  const jobId = newUlid();
  await conn.execute(
    `INSERT INTO jobs
       (id, org_id, project_id, queue, kind, payload, status, max_attempts, available_at)
     VALUES (?, ?, ?, ?, ?, ?::jsonb, 'queued', ?, ?)`,
    [
      jobId,
      source.org_id,
      source.project_id,
      "agent-runs",
      "agent_run",
      JSON.stringify({ run_id: newId }),
      3,
      new Date().toISOString(),
    ],
  );

  await eventDispatcher.dispatch(db, {
    orgId: source.org_id,
    projectId: source.project_id,
    actor: "system",
    subjectKind: "agent_run",
    subjectId: id,
    verb: "retried",
    payload: { parent: id, retry: newId },
  });

  return { id: newId };
}
