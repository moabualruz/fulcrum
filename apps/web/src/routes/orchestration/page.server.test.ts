import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { OrchestrationDashboardData } from "$lib/server/orchestration";

const calls: Array<{ method: string; input?: Record<string, unknown> }> = [];
let dispatches: unknown[] = [];
let projects: unknown[] = [];
let dashboardStatus = {
  lastTickAt: null,
  workerConnected: false,
  concurrencyUsed: 0,
  concurrencyMax: 4,
  lastSyncDate: null,
};

mock.module("$lib/server/orchestration-config-api", () => ({
  createOrchestrationConfigApiForEvent: () => ({
    orchestration: {
      dashboard: async (input: Record<string, unknown>) => {
        calls.push({ method: "dashboard", input });
        const projectId = input.projectId as string | undefined;
        return {
          status: dashboardStatus,
          dispatches: projectId
            ? (dispatches as Array<{ project_id: string | null }>).filter((dispatch) => dispatch.project_id === projectId)
            : dispatches,
          retryQueue: [],
        };
      },
      projects: async () => {
        calls.push({ method: "projects" });
        return projects;
      },
    },
    runs: {
      dispatch: async (input: Record<string, unknown>) => {
        calls.push({ method: "runs.dispatch", input });
        return { id: "run-dispatched", status: "queued" };
      },
      cancel: async (input: Record<string, unknown>) => {
        calls.push({ method: "runs.cancel", input });
        return { ok: true };
      },
      retry: async (input: Record<string, unknown>) => {
        calls.push({ method: "runs.retry", input });
        return { id: input.id };
      },
    },
  }),
}));

function mockUrl(params: Record<string, string> = {}): URL {
  const u = new URL("http://localhost:5173/orchestration");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u;
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

function event(data: Record<string, string> = {}, url: URL = mockUrl()) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return {
    url,
    locals: { activeProjectId: "project-1" },
    request: new Request(url, { method: "POST", body: fd }),
    fetch,
  };
}

describe("/orchestration +page.server.ts", () => {
  beforeEach(() => {
    calls.splice(0, calls.length);
    dispatches = [];
    projects = [];
    dashboardStatus = {
      lastTickAt: null,
      workerConnected: false,
      concurrencyUsed: 0,
      concurrencyMax: 4,
      lastSyncDate: null,
    };
  });

  test("returns dashboard data for empty DB", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(event({}, mockUrl()) as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<OrchestrationDashboardData & { projects: unknown[] }>(result);
    expect(payload.status.concurrencyUsed).toBe(0);
    expect(payload.status.concurrencyMax).toBe(4);
    expect(payload.dispatches).toEqual([]);
    expect(payload.retryQueue).toEqual([]);
    expect(payload.projects).toEqual([]);
    expect(calls).toEqual([{ method: "dashboard", input: { projectId: undefined } }, { method: "projects" }]);
  });

  test("returns dispatches with seeded runs", async () => {
    dispatches = [
      {
        id: "r1",
        agent: "claude",
        status: "running",
        symphony_state: "dispatched",
        orchestration_state: "claimed",
        claimed_by: null,
        started_at: "2026-05-01T00:00:00Z",
        ended_at: null,
        project_id: null,
      },
    ];
    dashboardStatus = { ...dashboardStatus, concurrencyUsed: 1, workerConnected: true };
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load(event({}, mockUrl()) as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<OrchestrationDashboardData & { projects: unknown[] }>(result);
    expect(payload.dispatches).toHaveLength(1);
    expect(payload.dispatches[0]?.agent).toBe("claude");
    expect(payload.status.concurrencyUsed).toBe(1);
    expect(payload.status.workerConnected).toBe(true);
  });

  test("dispatches include orchestration_state", async () => {
    dispatches = [
      {
        id: "r2",
        agent: "codex",
        status: "running",
        symphony_state: null,
        orchestration_state: "claimed",
        claimed_by: null,
        started_at: "2026-05-01T00:00:00Z",
        ended_at: null,
        project_id: null,
      },
    ];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load(event({}, mockUrl()) as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<OrchestrationDashboardData & { projects: unknown[] }>(result);
    expect(payload.dispatches[0]?.orchestration_state).toBe("claimed");
    expect(payload.dispatches[0]?.claimed_by).toBeNull();
  });

  test("filter by project narrows dispatches", async () => {
    const proj1 = "proj-aaa";
    dispatches = [
      { id: "r3", agent: "claude", status: "queued", symphony_state: null, orchestration_state: null, claimed_by: null, started_at: "2026-05-01T00:00:00Z", ended_at: null, project_id: proj1 },
      { id: "r4", agent: "codex", status: "queued", symphony_state: null, orchestration_state: null, claimed_by: null, started_at: "2026-05-01T00:00:00Z", ended_at: null, project_id: null },
    ];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.load(event({}, mockUrl({ project: proj1 })) as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<OrchestrationDashboardData & { projects: unknown[] }>(result);
    expect(payload.dispatches).toHaveLength(1);
    expect(payload.dispatches[0]?.agent).toBe("claude");
    expect(calls[0]).toEqual({ method: "dashboard", input: { projectId: proj1 } });
  });

  test("dispatch, cancel, and retry actions delegate to public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    const dispatch = await mod.actions.dispatch(
      event({ task_id: "task-1", agent: "codex" }) as Parameters<typeof mod.actions.dispatch>[0],
    );
    const cancel = await mod.actions.cancel(event({ run_id: "run-1" }) as Parameters<typeof mod.actions.cancel>[0]);
    const retry = await mod.actions.retry(event({ run_id: "run-1" }) as Parameters<typeof mod.actions.retry>[0]);
    expect(dispatch).toEqual({ ok: true, message: "Dispatched run run-dispatched (queued)" });
    expect(cancel).toEqual({ ok: true, message: "Run cancelled" });
    expect(retry).toEqual({ ok: true, message: "Run queued for retry" });
    expect(calls).toEqual([
      { method: "runs.dispatch", input: { taskId: "task-1", agent: "codex", projectId: "project-1" } },
      { method: "runs.cancel", input: { id: "run-1" } },
      { method: "runs.retry", input: { id: "run-1" } },
    ]);
  });
});
