/**
 * Agent-run service — pure DB operations for dispatching/cancelling/retrying runs.
 * Canonical home; web layer re-exports from here.
 * Dependency direction: services use neutral persistence protocols (never web).
 */
import type { EntityManager } from "@mikro-orm/postgresql";
import type { SqlExecutor } from "../db/sql.ts";
import { newUlid } from "../shared/ids.ts";

type DbHandle = EntityManager | { em?: EntityManager } | SqlExecutor;

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

function assertEm(db: DbHandle) {
  if ("persist" in db && typeof (db as { persist: unknown }).persist === "function") {
    return db as EntityManager;
  }
  if ("em" in db) {
    const em = (db as { em?: unknown }).em;
    if (em && typeof (em as { persist?: unknown }).persist === "function") {
      return em as EntityManager;
    }
  }
  throw new Error("runs.ts: EntityManager required for this operation.");
}

function isSqlExecutor(db: DbHandle): db is SqlExecutor {
  return !("em" in db) && "query" in db && typeof (db as { query: unknown }).query === "function";
}

async function appendServiceEvent(
  db: DbHandle,
  input: {
    orgId: string;
    projectId?: string | null;
    subjectKind: string;
    subjectId: string;
    verb: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const id = newUlid();
  if (isSqlExecutor(db)) {
    await db.query(
      `INSERT INTO events (id, org_id, project_id, actor, subject_kind, subject_id, verb, payload, created_at)
       VALUES ($1, $2, $3, 'system', $4, $5, $6, $7::jsonb, now())`,
      [id, input.orgId, input.projectId ?? null, input.subjectKind, input.subjectId, input.verb, JSON.stringify(input.payload ?? {})],
    );
    return;
  }
  await assertEm(db).getConnection().execute(
    `INSERT INTO events (id, org_id, project_id, actor, subject_kind, subject_id, verb, payload, created_at)
     VALUES (?, ?, ?, 'system', ?, ?, ?, ?::jsonb, now())`,
    [id, input.orgId, input.projectId ?? null, input.subjectKind, input.subjectId, input.verb, JSON.stringify(input.payload ?? {})],
  );
}

export async function dispatchRunAction(
  db: DbHandle,
  input: DispatchRunInput,
): Promise<{ id: string; task_id: string; agent: string; status: RunStatus }> {
  if (isSqlExecutor(db)) {
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
    await appendServiceEvent(db, {
      orgId: input.orgId,
      projectId: input.projectId ?? null,
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

  // Inline job enqueue via EntityManager connection.
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

  await appendServiceEvent(db, {
    orgId: input.orgId,
    projectId: input.projectId ?? null,
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
  if (isSqlExecutor(db)) {
    const rows = await db.query<RunScopeRow>(
      `UPDATE agent_runs
          SET status = 'cancelled', ended_at = now()
        WHERE id = $1 AND org_id = $2 AND status IN ('queued', 'running')
        RETURNING org_id, project_id`,
      [id, orgId],
    );
    const row = rows[0];
    if (row) {
      await appendServiceEvent(db, {
        orgId: row.org_id,
        projectId: row.project_id,
        subjectKind: "agent_run",
        subjectId: id,
        verb: "cancelled",
      });
    }
    return { ok: true };
  }
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
    await appendServiceEvent(db, {
      orgId: row.org_id,
      projectId: row.project_id,
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
  if (isSqlExecutor(db)) {
    const sourceRows = await db.query<RunSourceRow>(
      `SELECT id, org_id, project_id, agent, model, prompt
         FROM agent_runs WHERE id = $1 AND org_id = $2`,
      [id, orgId],
    );
    const source = sourceRows[0];
    if (!source) throw new Error(`retryRunAction: run not found: ${id}`);

    const newId = newUlid();
    await db.query(
      `INSERT INTO agent_runs
         (id, org_id, project_id, agent, model, prompt, status, parent_run_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'queued', $7)`,
      [newId, source.org_id, source.project_id, source.agent, source.model, source.prompt, id],
    );

    const jobId = newUlid();
    await db.query(
      `INSERT INTO jobs
         (id, org_id, project_id, queue, kind, payload, status, max_attempts, available_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'queued', $7, $8)`,
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

    await appendServiceEvent(db, {
      orgId: source.org_id,
      projectId: source.project_id,
      subjectKind: "agent_run",
      subjectId: id,
      verb: "retried",
      payload: { parent: id, retry: newId },
    });

    return { id: newId };
  }
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

  await appendServiceEvent(db, {
    orgId: source.org_id,
    projectId: source.project_id,
    subjectKind: "agent_run",
    subjectId: id,
    verb: "retried",
    payload: { parent: id, retry: newId },
  });

  return { id: newId };
}
