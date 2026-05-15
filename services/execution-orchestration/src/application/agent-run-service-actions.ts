/**
 * Agent-run service — pure DB operations for dispatching/cancelling/retrying runs.
 * Canonical home; web layer re-exports from here.
 * Dependency direction: services use neutral persistence protocols (never web).
 */
import type { EntityManager } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";
import type { SqlExecutor, SqlValue } from "@platform-core/infrastructure/application-database/sql.ts";
import { newUlid } from "@platform-core/application/platform-primitives/monotonic-id.ts";

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
  task_id: string | null;
  project_id: string | null;
}

interface RunSourceRow {
  id: string;
  org_id: string;
  task_id: string | null;
  project_id: string | null;
  agent: string | null;
  model: string | null;
  prompt: string | null;
}

async function projectIdForTask(db: DbHandle, taskId: string | null): Promise<string | null> {
  if (!taskId) return null;
  if (isSqlExecutor(db)) {
    const rows = await db.query<{ project_id: string | null }>(
      `SELECT project_id FROM tasks WHERE id = $1`,
      [taskId],);
    return rows[0]?.project_id ?? null;
  }
  const rows = await assertEm(db).getConnection().execute(
    `SELECT project_id FROM tasks WHERE id = ?`,
    [taskId],) as Array<{ project_id: string | null }>;
  return rows[0]?.project_id ?? null;
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

async function tableColumns(db: DbHandle, tableName: string): Promise<Set<string>> {
  if (isSqlExecutor(db)) {
    const rows = await db.query<{ column_name: string }>(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1`,
      [tableName],);
    return new Set(rows.map((row) => row.column_name));
  }
  const rows = await assertEm(db).getConnection().execute(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ?`,
    [tableName],) as Array<{ column_name: string }>;
  return new Set(rows.map((row) => row.column_name));
}

async function newAgentRunId(db: DbHandle): Promise<string> {
  if (isSqlExecutor(db)) return newUlid();
  const rows = await assertEm(db).getConnection().execute(
    `SELECT data_type
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'agent_runs'
        AND column_name = 'id'`,) as Array<{ data_type: string }>;
  return rows[0]?.data_type === "uuid"  ? randomUUID() : newUlid();
}

function sqlParam(index: number, dollarParams: boolean): string {
  return dollarParams ? `$${index}` : "?";
}

function runInsert(
  columns: Set<string>,
  input: DispatchRunInput,
  id: string,
  parentRunId: string | null,
  dollarParams: boolean,): { sql: string; params: SqlValue[] } {
  const names: string[] = [];
  const params: SqlValue[] = [];
  const push = (column: string, value: SqlValue) => {
    if (!columns.has(column)) return;
    names.push(column);
    params.push(value);
  };

  push("id", id);
  push("org_id", input.orgId);
  push("project_id", input.projectId ?? null);
  push("task_id", input.taskId.trim() ? input.taskId : null);
  if (columns.has("agent_name")) push("agent_name", input.agent);
  else push("agent", input.agent);
  if (columns.has("agent_version")) push("agent_version", input.model ?? null);
  else push("model", input.model ?? null);
  if (columns.has("thread_id")) push("thread_id", input.prompt ?? null);
  else push("prompt", input.prompt ?? null);
  push("parent_run_id", parentRunId);
  push("status", "queued");

  const placeholders = params.map((_, index) => sqlParam(index + 1, dollarParams));
  return {
    sql: `INSERT INTO agent_runs (${names.join(", ")}) VALUES (${placeholders.join(", ")})`,
    params,
  };
}

function runSourceSelect(columns: Set<string>, dollarParams: boolean): string {
  const taskExpr = columns.has("task_id") ? "task_id" : "NULL";
  const projectExpr = columns.has("project_id") ? "project_id" : "NULL";
  const agentExpr = columns.has("agent_name") ? "agent_name" : columns.has("agent") ? "agent" : "NULL";
  const modelExpr = columns.has("agent_version") ? "agent_version" : columns.has("model") ? "model" : "NULL";
  const promptExpr = columns.has("thread_id") ? "thread_id" : columns.has("prompt") ? "prompt" : "NULL";
  return `SELECT id,
                 org_id,
                 ${taskExpr} AS task_id,
                 ${projectExpr} AS project_id,
                 ${agentExpr} AS agent,
                 ${modelExpr} AS model,
                 ${promptExpr} AS prompt
            FROM agent_runs
           WHERE id = ${sqlParam(1, dollarParams)} AND org_id = ${sqlParam(2, dollarParams)}`;
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
  },): Promise<void> {
  if (isSqlExecutor(db)) {
    const id = newUlid();
    await db.query(
      `INSERT INTO events (id, org_id, project_id, actor, subject_kind, subject_id, verb, payload, created_at)
       VALUES ($1, $2, $3, 'system', $4, $5, $6, $7::jsonb, now())`,
      [id, input.orgId, input.projectId ?? null, input.subjectKind, input.subjectId, input.verb, JSON.stringify(input.payload ?? {})],);
    return;
  }
  const id = randomUUID();
  await assertEm(db).getConnection().execute(
    `INSERT INTO events (id, org_id, project_id, actor, subject_kind, subject_id, verb, payload, created_at)
     VALUES (?, ?, ?, 'system', ?, ?, ?, ?::jsonb, now())`,
    [id, input.orgId, input.projectId ?? null, input.subjectKind, input.subjectId, input.verb, JSON.stringify(input.payload ?? {})],);
}

export async function dispatchRunAction(
  db: DbHandle,
  input: DispatchRunInput,): Promise<{ id: string; task_id: string; agent: string; status: RunStatus }> {
  const columns = await tableColumns(db, "agent_runs");
  if (isSqlExecutor(db)) {
    const id = newUlid();
    const insert = runInsert(columns, input, id, null, true);
    await db.query(insert.sql, insert.params);
    const jobId = newUlid();
    await db.query(
      `INSERT INTO jobs
         (id, org_id, project_id, queue, kind, payload, status, max_attempts, available_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'queued', $7, $8)`,
      [jobId, input.orgId, input.projectId ?? null, "agent-runs", "agent_run", JSON.stringify({ run_id: id }), 3, new Date().toISOString()],);
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
  const id = await newAgentRunId(db);
  const insert = runInsert(columns, input, id, null, false);
  await conn.execute(insert.sql, insert.params as never);

  // Inline job enqueue via EntityManager connection.
  const jobId = randomUUID();
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
    ],);

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
  orgId: string,): Promise<{ ok: boolean }> {
  const columns = await tableColumns(db, "agent_runs");
  const endedAssignment = columns.has("ended_at") ? ", ended_at = now()" : "";
  const taskExpr = columns.has("task_id") ? "task_id" : "NULL";
  const projectExpr = columns.has("project_id") ? "project_id" : "NULL";
  if (isSqlExecutor(db)) {
    const rows = await db.query<RunScopeRow>(
      `UPDATE agent_runs
          SET status = 'cancelled'${endedAssignment}
        WHERE id = $1 AND org_id = $2 AND status IN ('queued', 'running')
        RETURNING org_id, ${taskExpr} AS task_id, ${projectExpr} AS project_id`,
      [id, orgId],);
    const row = rows[0];
    if (row) {
      const projectId = row.project_id ?? await projectIdForTask(db, row.task_id);
      await appendServiceEvent(db, {
        orgId: row.org_id,
        projectId,
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
        SET status = 'cancelled'${endedAssignment}
      WHERE id = ? AND org_id = ? AND status IN ('queued', 'running')
      RETURNING org_id, ${taskExpr} AS task_id, ${projectExpr} AS project_id`,
    [id, orgId],) as Array<RunScopeRow>;
  const row = rows[0];
  if (row) {
    const projectId = row.project_id ?? await projectIdForTask(db, row.task_id);
    await appendServiceEvent(db, {
      orgId: row.org_id,
      projectId,
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
  orgId: string,): Promise<{ id: string }> {
  const columns = await tableColumns(db, "agent_runs");
  if (isSqlExecutor(db)) {
    const sourceRows = await db.query<RunSourceRow>(
      runSourceSelect(columns, true),
      [id, orgId],);
    const source = sourceRows[0];
    if (!source) throw new Error(`retryRunAction: run not found: ${id}`);

    const newId = newUlid();
    const insert = runInsert(columns, {
      orgId: source.org_id,
      projectId: source.project_id,
      taskId: source.task_id ?? "",
      agent: source.agent ?? "",
      model: source.model,
      prompt: source.prompt,
    }, newId, id, true);
    await db.query(insert.sql, insert.params);

    const jobId = newUlid();
    await db.query(
      `INSERT INTO jobs
         (id, org_id, project_id, queue, kind, payload, status, max_attempts, available_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'queued', $7, $8)`,
      [
        jobId,
        source.org_id,
        source.project_id ?? await projectIdForTask(db, source.task_id),
        "agent-runs",
        "agent_run",
        JSON.stringify({ run_id: newId }),
        3,
        new Date().toISOString(),
      ],);

    const projectId = source.project_id ?? await projectIdForTask(db, source.task_id);
    await appendServiceEvent(db, {
      orgId: source.org_id,
      projectId,
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
    runSourceSelect(columns, false),
    [id, orgId],) as Array<RunSourceRow>;
  const source = sourceRows[0];
  if (!source) throw new Error(`retryRunAction: run not found: ${id}`);

  const newId = await newAgentRunId(db);
  const insert = runInsert(columns, {
    orgId: source.org_id,
    projectId: source.project_id,
    taskId: source.task_id ?? "",
    agent: source.agent ?? "",
    model: source.model,
    prompt: source.prompt,
  }, newId, id, false);
  await conn.execute(insert.sql, insert.params as never);

  // Inline job enqueue via EntityManager connection
  const jobId = randomUUID();
  await conn.execute(
    `INSERT INTO jobs
       (id, org_id, project_id, queue, kind, payload, status, max_attempts, available_at)
     VALUES (?, ?, ?, ?, ?, ?::jsonb, 'queued', ?, ?)`,
    [
      jobId,
      source.org_id,
      source.project_id ?? await projectIdForTask(db, source.task_id),
      "agent-runs",
      "agent_run",
      JSON.stringify({ run_id: newId }),
      3,
      new Date().toISOString(),
    ],);

  const projectId = source.project_id ?? await projectIdForTask(db, source.task_id);
  await appendServiceEvent(db, {
    orgId: source.org_id,
    projectId,
    subjectKind: "agent_run",
    subjectId: id,
    verb: "retried",
    payload: { parent: id, retry: newId },
  });

  return { id: newId };
}
