import { afterEach, describe, expect, test } from "bun:test";

import type { SqlExecutor, SqlValue } from "../../src/db/sql.ts";
import { createHttpServer } from "../../src/orchestration/symphony/http-server.ts";

class FakeSymphonyDb implements SqlExecutor {
  engine = "pglite" as const;
  readonly calls: Array<{ sql: string; params: readonly SqlValue[] }> = [];

  async query<T>(sql: string, params: readonly SqlValue[] = []): Promise<T[]> {
    this.calls.push({ sql, params });

    if (sql.includes("WHERE ar.status = 'running'")) {
      return [
        {
          run_id: "run-running",
          task_id: "task-running",
          task_title: "ISSUE-<1>&",
          run_status: "running",
          run_started_at: "2026-05-11T10:00:00.000Z",
          run_ended_at: null,
          attempt_count: 0,
        },
      ] as T[];
    }

    if (sql.includes("WHERE ar.status = 'queued'")) {
      return [
        {
          run_id: "run-retry",
          task_id: "task-retry",
          task_title: "ISSUE-2",
          run_status: "queued",
          run_started_at: "2026-05-11T10:01:00.000Z",
          run_ended_at: null,
          attempt_count: 2,
        },
      ] as T[];
    }

    if (sql.includes("SELECT id, title, status FROM tasks")) {
      if (params[0] === "missing") return [];
      return [
        {
          id: "task-running",
          title: "ISSUE-<1>&",
          status: "ready",
        },
      ] as T[];
    }

    if (sql.includes("FROM events")) {
      return [
        {
          created_at: "2026-05-11T10:02:00.000Z",
          verb: "agent_run.updated",
          payload: { message: "started" },
        },
      ] as T[];
    }

    if (sql.includes("FROM agent_runs WHERE task_id")) {
      return [
        {
          id: "run-running",
          task_id: "task-running",
          status: "running",
          started_at: "2026-05-11T10:00:00.000Z",
          ended_at: null,
        },
        {
          id: "run-old",
          task_id: "task-running",
          status: "failed",
          started_at: "2026-05-10T10:00:00.000Z",
          ended_at: "2026-05-10T10:10:00.000Z",
        },
      ] as T[];
    }

    throw new Error(`unexpected query: ${sql}`);
  }

  async exec() {}
  async close() {}
}

const handles: Array<{ stop: () => void }> = [];

afterEach(() => {
  while (handles.length > 0) {
    handles.pop()?.stop();
  }
});

describe("createHttpServer", () => {
  test("serves loopback HTML, JSON state, issue detail, refresh, and not-found responses", async () => {
    let refreshes = 0;
    const db = new FakeSymphonyDb();
    const server = await createHttpServer({
      db,
      port: 0,
      onRefresh: () => {
        refreshes += 1;
      },
    });
    handles.push(server);
    const baseUrl = `http://${server.host}:${server.port}`;

    expect(server.host).toBe("127.0.0.1");
    expect(server.port).toBeGreaterThan(0);

    const html = await fetch(`${baseUrl}/`);
    expect(html.status).toBe(200);
    expect(html.headers.get("content-type")).toContain("text/html");
    const body = await html.text();
    expect(body).toContain("Symphony Orchestrator");
    expect(body).toContain("Running: 1 | Retrying: 1");
    expect(body).toContain("ISSUE-&lt;1&gt;&amp;");
    expect(body).not.toContain("ISSUE-<1>&");

    const state = await fetch(`${baseUrl}/api/v1/state`);
    expect(state.status).toBe(200);
    expect(await state.json()).toMatchObject({
      counts: { running: 1, retrying: 1 },
      running: [{ issue_id: "task-running", issue_identifier: "ISSUE-<1>&" }],
      retrying: [{ issue_id: "task-retry", issue_identifier: "ISSUE-2" }],
    });

    const issue = await fetch(`${baseUrl}/api/v1/${encodeURIComponent("ISSUE-<1>&")}`);
    expect(issue.status).toBe(200);
    expect(await issue.json()).toMatchObject({
      issue_identifier: "ISSUE-<1>&",
      issue_id: "task-running",
      status: "running",
      attempts: { restart_count: 1, current_retry_attempt: 2 },
      recent_events: [{ event: "agent_run.updated", message: "started" }],
    });

    const missing = await fetch(`${baseUrl}/api/v1/missing`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      error: { code: "issue_not_found", message: "Issue 'missing' not found" },
    });

    const refresh = await fetch(`${baseUrl}/api/v1/refresh`, { method: "POST" });
    expect(refresh.status).toBe(200);
    expect(await refresh.json()).toEqual({
      queued: true,
      message: "Refresh cycle queued",
    });
    expect(refreshes).toBe(1);

    const badRoute = await fetch(`${baseUrl}/api/v1/state`, { method: "POST" });
    expect(badRoute.status).toBe(404);
    expect(await badRoute.json()).toEqual({
      error: { code: "not_found", message: "Route not found" },
    });
  });
});
