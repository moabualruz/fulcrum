import { afterAll, beforeAll, describe, expect, test, mock, beforeEach } from "bun:test";
import type { OrchestrationDashboardData } from "$lib/server/orchestration";
import { orchestrationMock } from "$lib/test/orchestration-mock";
import { requestServiceScopeMock } from "$lib/test/request-service-scope-mock";

// `mock.module` is process-global; these seams answer only while this suite
// runs and otherwise delegate to the real implementations for foreign suites.
let suiteActive = false;
let suiteDispatches: unknown[] = [];
let suiteProjects: unknown[] = [];

mock.module("$lib/server/request-service-scope", () =>
  requestServiceScopeMock((_locals, projectId) =>
    suiteActive
      ? { em: { kind: "mock-em" }, ctx: { orgId: "org1", userId: "user1", projectId: projectId ?? null } }
      : null,
  ),
);

// `$lib/server/orchestration` is a barrel; `orchestrationMock` keeps a complete
// export set (real `loadOrchestrationConfig` / `upsertOrchestrationConfig` / …)
// and only overrides the two functions this suite drives, while it is active.
mock.module("$lib/server/orchestration", () =>
  orchestrationMock(() =>
    suiteActive
      ? {
          loadOrchestrationDashboard: async (...args: unknown[]) => {
            const projectId = args[2] as string | undefined;
            return {
              ...EMPTY_DASHBOARD,
              dispatches: projectId
                ? (suiteDispatches as Array<{ project_id: string | null }>).filter(
                    (d) => d.project_id === projectId,
                  )
                : suiteDispatches,
            };
          },
          listOrchestrationProjectOptions: async () => suiteProjects,
        }
      : null,
  ),
);

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
  // The route resolves its data through `requestServiceScope` and
  // `$lib/server/orchestration` — both stubbed at the top of this file via the
  // shared complete-export factories. Here we only seed the suite-scoped data
  // the orchestration dashboard mock reads.
  suiteDispatches = dispatches;
  suiteProjects = projects;
  mock.module("$lib/server/runs", () => ({
    dispatchRunAction: async () => ({ id: "run-dispatched" }),
    cancelRunAction: async () => {},
    retryRunAction: async () => {},
  }));
  // `$lib/feedback/action-result` is a pure module; the route's `actionOk`
  // result is never asserted by this load()-only suite. Mocking it here froze
  // a process-global, wrong-shaped (`success` vs `ok`) export set that broke
  // every sibling suite importing the real module — left unmocked on purpose.
  return { projects };
}

describe("/orchestration +page.server.ts load()", () => {
  beforeAll(() => {
    suiteActive = true;
  });
  afterAll(() => {
    suiteActive = false;
  });
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
