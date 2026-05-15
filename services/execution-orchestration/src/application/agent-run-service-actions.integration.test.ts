import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import type { SqlExecutor, SqlValue } from "@platform-core/infrastructure/application-database/sql.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { createTaskAction } from "@work-management/application/work-item-service-actions.ts";
import {
  cancelRunAction,
  dispatchRunAction,
  retryRunAction,
} from "@execution-orchestration/application/agent-run-service-actions.ts";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  return db;
}

async function createProject(em: TestOrm["em"]): Promise<string> {
  const id = randomUUID();
  await em.getConnection().execute(
    `INSERT INTO projects (id, org_id, slug, name, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, now(), now())`,
    [id, DEFAULT_ORG_ID, `run-service-${id.slice(0, 8)}`, "Run Service Project", "Integration coverage"],);
  return id;
}

async function runRows(em: TestOrm["em"]): Promise<Array<Record<string, unknown>>> {
  return await em.getConnection().execute(
    `SELECT r.id, r.org_id, t.project_id, r.task_id, r.agent_name, r.agent_version, r.thread_id, r.status
       FROM agent_runs r
       LEFT JOIN tasks t ON t.id = r.task_id
      WHERE r.agent_name = 'codex'
      ORDER BY r.created_at ASC, r.id ASC`,) as Array<Record<string, unknown>>;
}

async function jobRows(em: TestOrm["em"]): Promise<Array<Record<string, unknown>>> {
  return await em.getConnection().execute(
    `SELECT queue, kind, payload, status, max_attempts FROM jobs WHERE queue = 'agent-runs' ORDER BY available_at ASC, id ASC`,) as Array<Record<string, unknown>>;
}

async function eventRows(em: TestOrm["em"], subjectId?: string): Promise<Array<{ verb: string; payload: Record<string, unknown> }>> {
  const params = subjectId ? [subjectId] : [];
  return await em.getConnection().execute(
    `SELECT verb, payload FROM events
      WHERE subject_kind = 'agent_run' ${subjectId ? "AND subject_id = ?" : ""}
      ORDER BY created_at ASC, id ASC`,
    params,) as Array<{ verb: string; payload: Record<string, unknown> }>;
}

describe("run service actions with real MikroORM persistence", () => {
  test("dispatches, enqueues, cancels, retries, and records events", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const projectId = await createProject(em);
    const task = await createTaskAction(em, {
      orgId: DEFAULT_ORG_ID,
      projectId,
      title: "Run-backed task",
      status: "pending",
    });

    const dispatched = await dispatchRunAction(em, {
      orgId: DEFAULT_ORG_ID,
      projectId,
      taskId: task.id,
      agent: "codex",
      model: "gpt-5.3-codex",
      prompt: "Use the real service path",
    });

    expect(dispatched).toMatchObject({ task_id: task.id, agent: "codex", status: "queued" });
    expect(await runRows(em)).toEqual([
      expect.objectContaining({
        id: dispatched.id,
        org_id: DEFAULT_ORG_ID,
        project_id: projectId,
        task_id: task.id,
        agent_name: "codex",
        agent_version: "gpt-5.3-codex",
        thread_id: "Use the real service path",
        status: "queued",
      }),
    ]);
    expect(await jobRows(em)).toEqual([
      expect.objectContaining({
        queue: "agent-runs",
        kind: "agent_run",
        payload: { run_id: dispatched.id },
        status: "queued",
        max_attempts: 3,
      }),
    ]);

    expect(await cancelRunAction(em, dispatched.id, DEFAULT_ORG_ID)).toEqual({ ok: true });
    let rows = await runRows(em);
    expect(rows[0]!.status).toBe("cancelled");

    const retry = await retryRunAction(em, dispatched.id, DEFAULT_ORG_ID);
    rows = await runRows(em);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      id: retry.id,
      org_id: DEFAULT_ORG_ID,
      project_id: projectId,
      task_id: task.id,
      agent_name: "codex",
      agent_version: "gpt-5.3-codex",
      thread_id: "Use the real service path",
      status: "queued",
    });
    expect((await jobRows(em)).map((job) => job.payload)).toEqual([{ run_id: dispatched.id }, { run_id: retry.id }]);

    const events = await eventRows(em, dispatched.id);
    expect(events.map((event) => event.verb).sort()).toEqual(["cancelled", "dispatched", "retried"]);
    expect(events.find((event) => event.verb === "dispatched")!.payload).toEqual({ task_id: task.id, agent: "codex" });
    expect(events.find((event) => event.verb === "cancelled")!.payload).toEqual({});
    expect(events.find((event) => event.verb === "retried")!.payload).toEqual({ parent: dispatched.id, retry: retry.id });
  });

  test("cancel is idempotent for terminal or missing runs and retry rejects unknown run", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const unknown = randomUUID();

    expect(await cancelRunAction(em, unknown, DEFAULT_ORG_ID)).toEqual({ ok: true });
    expect(await eventRows(em)).toEqual([]);
    await expect(retryRunAction(em, unknown, DEFAULT_ORG_ID)).rejects.toThrow("run not found");
  });

  test("SqlExecutor branch dispatches, cancels, retries, looks up task project, and emits service events", async () => {
    const queries: Array<{ sql: string; params: readonly SqlValue[] }> = [];
    const runs = new Map<string, Record<string, unknown>>;
    const jobs: Array<Record<string, unknown>> = [];
    const events: Array<Record<string, unknown>> = [];
    const taskId = "task-sql-1";
    const projectId = "project-sql-1";
    const sqlDb: SqlExecutor = {
      engine: "pglite",
      async query<T>(sql: string, params: readonly SqlValue[] = []) {
        queries.push({ sql, params });
        if (sql.includes("information_schema.columns")) {
          return [
            { column_name: "id" },
            { column_name: "org_id" },
            { column_name: "task_id" },
            { column_name: "agent_name" },
            { column_name: "agent_version" },
            { column_name: "thread_id" },
            { column_name: "status" },
          ] as T[];
        }
        if (sql.includes("INSERT INTO agent_runs")) {
          runs.set(String(params[0]), {
            id: params[0],
            org_id: params[1],
            task_id: params[2],
            agent_name: params[3],
            agent_version: params[4],
            thread_id: params[5],
            status: params[6],
          });
          return [] as T[];
        }
        if (sql.includes("INSERT INTO jobs")) {
          jobs.push({
            id: params[0],
            org_id: params[1],
            project_id: params[2],
            queue: params[3],
            kind: params[4],
            payload: JSON.parse(String(params[5])),
            status: "queued",
            max_attempts: params[6],
          });
          return [] as T[];
        }
        if (sql.includes("INSERT INTO events")) {
          events.push({
            id: params[0],
            org_id: params[1],
            project_id: params[2],
            subject_kind: params[3],
            subject_id: params[4],
            verb: params[5],
            payload: JSON.parse(String(params[6])),
          });
          return [] as T[];
        }
        if (sql.includes("UPDATE agent_runs") && sql.includes("RETURNING org_id, task_id")) {
          const run = runs.get(String(params[0]));
          if (!run || run["org_id"] !== params[1] || !["queued", "running"].includes(String(run["status"]))) {
            return [] as T[];
          }
          run["status"] = "cancelled";
          return [{ org_id: run["org_id"], task_id: run["task_id"] }] as T[];
        }
        if (sql.includes("SELECT project_id FROM tasks")) {
          return [{ project_id: params[0] === taskId ? projectId : null }] as T[];
        }
        if (sql.includes("FROM agent_runs") && sql.includes("WHERE id = $1") && sql.includes("org_id = $2")) {
          const run = runs.get(String(params[0]));
          return run && run["org_id"] === params[1]
            ? [{
              id: run["id"],
              org_id: run["org_id"],
              task_id: run["task_id"],
              project_id: null,
              agent: run["agent_name"],
              model: run["agent_version"],
              prompt: run["thread_id"],
            }] as T[]
            : [] as T[];
        }
        throw new Error(`unexpected SQL: ${sql}`);
      },
      async exec() {},
      async close() {},
    };

    const dispatched = await dispatchRunAction(sqlDb, {
      orgId: DEFAULT_ORG_ID,
      projectId,
      taskId,
      agent: "codex",
      model: "gpt-5.4",
      prompt: "real sql executor branch",
    });
    expect(dispatched).toMatchObject({ task_id: taskId, agent: "codex", status: "queued" });
    expect(jobs).toEqual([
      expect.objectContaining({
        org_id: DEFAULT_ORG_ID,
        project_id: projectId,
        queue: "agent-runs",
        kind: "agent_run",
        payload: { run_id: dispatched.id },
        max_attempts: 3,
      }),
    ]);
    expect(events).toEqual([
      expect.objectContaining({
        org_id: DEFAULT_ORG_ID,
        project_id: projectId,
        subject_kind: "agent_run",
        subject_id: dispatched.id,
        verb: "dispatched",
        payload: { task_id: taskId, agent: "codex" },
      }),
    ]);

    await expect(cancelRunAction(sqlDb, dispatched.id, DEFAULT_ORG_ID)).resolves.toEqual({ ok: true });
    expect(runs.get(dispatched.id)?.["status"]).toBe("cancelled");

    const retry = await retryRunAction(sqlDb, dispatched.id, DEFAULT_ORG_ID);
    expect(retry.id).not.toBe(dispatched.id);
    expect(runs.get(retry.id)).toMatchObject({
      org_id: DEFAULT_ORG_ID,
      task_id: taskId,
      agent_name: "codex",
      agent_version: "gpt-5.4",
      thread_id: "real sql executor branch",
      status: "queued",
    });
    expect(jobs.at(-1)).toMatchObject({
      org_id: DEFAULT_ORG_ID,
      project_id: projectId,
      payload: { run_id: retry.id },
    });
    expect(events.map((event) => event["verb"])).toEqual(["dispatched", "cancelled", "retried"]);
    expect(events.at(-1)).toMatchObject({
      project_id: projectId,
      subject_id: dispatched.id,
      payload: { parent: dispatched.id, retry: retry.id },
    });
    expect(queries.filter(({ sql }) => sql.includes("SELECT project_id FROM tasks"))).toHaveLength(3);

    await expect(retryRunAction(sqlDb, "missing-run", DEFAULT_ORG_ID)).rejects.toThrow("run not found");
  });
});
