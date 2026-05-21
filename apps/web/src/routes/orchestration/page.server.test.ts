import { describe, expect, test, mock, beforeEach } from "bun:test";
import type { OrchestrationDashboardData } from "$lib/server/orchestration";

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

const EMPTY_DASHBOARD: OrchestrationDashboardData = {
  status: {
    lastTickAt: null,
    workerConnected: false,
    concurrencyUsed: 0,
    concurrencyMax: 4,
    lastSyncDate: null,
  },
  dispatches: [],
  retryQueue: [],
};

function mockDb(dispatches: unknown[] = [], projects: unknown[] = []) {
  // The route resolves its data through `requestServiceScope`; it no longer
  // touches `$lib/server/db` directly. Stub the service scope it actually uses.
  mock.module("$lib/server/request-service-scope", () => ({
    requestServiceScope: async (_locals: unknown, projectId: string | null) => ({
      em: { kind: "mock-em" },
      ctx: { orgId: "org1", userId: "user1", projectId },
    }),
  }));
  mock.module("$lib/server/orchestration", () => ({
    loadOrchestrationDashboard: async (
      _db: unknown,
      _orgId: string,
      projectId?: string,
    ) => ({
      ...EMPTY_DASHBOARD,
      dispatches: projectId
        ? (dispatches as Array<{ project_id: string | null }>).filter(
            (d) => d.project_id === projectId,
          )
        : dispatches,
    }),
    // `+page.server.ts` also imports listOrchestrationProjectOptions; the
    // mock must declare it or the route load() fails to resolve the import.
    listOrchestrationProjectOptions: async () => projects,
    SYMPHONY_COLORS: {},
  }));
  mock.module("$lib/server/runs", () => ({
    dispatchRunAction: async () => ({ id: "run-dispatched" }),
    cancelRunAction: async () => {},
    retryRunAction: async () => {},
  }));
  mock.module("$lib/feedback/action-result", () => ({
    actionOk: (msg: string) => ({ success: true, message: msg }),
  }));
  return { projects };
}

describe("/orchestration +page.server.ts load()", () => {
  beforeEach(() => {
    mockDb();
  });

  test("returns dashboard data for empty DB", async () => {
    mockDb([], []);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      url: mockUrl(),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<OrchestrationDashboardData & { projects: unknown[] }>(result);
    expect(payload.status.concurrencyUsed).toBe(0);
    expect(payload.status.concurrencyMax).toBe(4);
    expect(payload.dispatches).toEqual([]);
    expect(payload.retryQueue).toEqual([]);
    expect(payload.projects).toEqual([]);
  });

  test("returns dispatches with seeded runs", async () => {
    const dispatches = [
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
    mockDb(dispatches, []);
    mock.module("$lib/server/orchestration", () => ({
      loadOrchestrationDashboard: async () => ({
        ...EMPTY_DASHBOARD,
        status: { ...EMPTY_DASHBOARD.status, concurrencyUsed: 1, workerConnected: true },
        dispatches,
      }),
      listOrchestrationProjectOptions: async () => [],
      SYMPHONY_COLORS: {},
    }));
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({
      url: mockUrl(),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<OrchestrationDashboardData & { projects: unknown[] }>(result);
    expect(payload.dispatches).toHaveLength(1);
    expect(payload.dispatches[0]?.agent).toBe("claude");
    expect(payload.status.concurrencyUsed).toBe(1);
    expect(payload.status.workerConnected).toBe(true);
  });

  test("dispatches include orchestration_state", async () => {
    const dispatches = [
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
    mock.module("$lib/server/orchestration", () => ({
      loadOrchestrationDashboard: async () => ({
        ...EMPTY_DASHBOARD,
        dispatches,
      }),
      listOrchestrationProjectOptions: async () => [],
      SYMPHONY_COLORS: {},
    }));
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load({
      url: mockUrl(),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<OrchestrationDashboardData & { projects: unknown[] }>(result);
    expect(payload.dispatches[0]?.orchestration_state).toBe("claimed");
    expect(payload.dispatches[0]?.claimed_by).toBeNull();
  });

  test("filter by project narrows dispatches", async () => {
    const proj1 = "proj-aaa";
    const allDispatches = [
      { id: "r3", agent: "claude", status: "queued", symphony_state: null,
        orchestration_state: null, claimed_by: null,
        started_at: "2026-05-01T00:00:00Z", ended_at: null, project_id: proj1 },
      { id: "r4", agent: "codex", status: "queued", symphony_state: null,
        orchestration_state: null, claimed_by: null,
        started_at: "2026-05-01T00:00:00Z", ended_at: null, project_id: null },
    ];
    mock.module("$lib/server/orchestration", () => ({
      loadOrchestrationDashboard: async (
        _em: unknown,
        _ctx: unknown,
        projectId?: string,
      ) => ({
        ...EMPTY_DASHBOARD,
        dispatches: projectId
          ? allDispatches.filter((d) => d.project_id === projectId)
          : allDispatches,
      }),
      listOrchestrationProjectOptions: async () => [],
      SYMPHONY_COLORS: {},
    }));
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.load({
      url: mockUrl({ project: proj1 }),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<OrchestrationDashboardData & { projects: unknown[] }>(result);
    expect(payload.dispatches).toHaveLength(1);
    expect(payload.dispatches[0]?.agent).toBe("claude");
  });
});
