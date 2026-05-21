import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { planningReviewMock } from "$lib/test/planning-review-mock";
import { requestServiceScopeMock } from "$lib/test/request-service-scope-mock";

const calls: string[] = [];
let runShouldFail = false;

const history = [
  {
    eventId: "event-1",
    createdAt: "2026-05-17T10:00:00.000Z",
    runner: "bun",
    status: "passed",
    testFileCount: 2,
    exitCode: 0,
    traceId: "trace-e2e-project-1",
  },
];

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/projects/project-1/e2e", { method: "POST", body: fd });
}

// `mock.module` is process-global; the seam answers only while this suite runs
// and otherwise delegates to the real resolver for foreign suites.
let suiteActive = false;

mock.module("$lib/server/request-service-scope", () =>
  requestServiceScopeMock((_locals, projectId) =>
    suiteActive
      ? { em: { kind: "mock-em" }, ctx: { orgId: "org-1", userId: "user-1", projectId: projectId ?? null } }
      : null,
  ),
);

mock.module("@planning-review/interface/project-review-reports.ts", () => planningReviewMock({
  buildUatCodeReviewHandoff: async (_em: unknown, _ctx: unknown, input: { projectId: string }) => {
    calls.push(`handoff:${input.projectId}`);
    return { projectId: input.projectId, status: "ready" };
  },
  recordUatCodeReviewDecision: async (_em: unknown, _ctx: unknown, input: { projectId: string; decision: string }) => {
    calls.push(`decision:${input.projectId}:${input.decision}`);
    return { projectId: input.projectId, status: "approved" };
  },
  runGeneratedE2eRegressionTests: async (_em: unknown, _ctx: unknown, input: { projectId: string; runner?: string }) => {
    calls.push(`e2e:${input.projectId}:${input.runner ?? ""}`);
    return { projectId: input.projectId, status: "passed" };
  },
  listGeneratedE2eRunHistory: async (_em: unknown, _ctx: unknown, input: { projectId: string; limit: number }) => {
    calls.push(`history:${input.projectId}:${input.limit}`);
    return history;
  },
}));

mock.module("@workflow-coordination/interface/http/workflow-api-client", () => ({
  WorkflowApiError: class WorkflowApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
  createWorkflowApiCaller: (options: { baseUrl: string; headers: { cookie: string } }) => {
    calls.push(`api:${options.baseUrl}:${options.headers.cookie}`);
    return {
      reports: {
        runGeneratedE2eRegressionTests: async (input: {
          projectId: string;
          runner: string;
          traceId: string;
          testFiles?: string[];
        }) => {
          calls.push(`run:${input.projectId}:${input.runner}:${input.traceId}:${input.testFiles?.join("|") ?? ""}`);
          if (runShouldFail) throw new Error("runner unavailable");
          return {
            status: "passed",
            runner: input.runner,
            traceId: input.traceId,
            testFiles: input.testFiles ?? [],
            exitCode: 0,
            summary: "Generated E2E tests passed",
          };
        },
      },
    };
  },
}));

beforeEach(() => {
  calls.splice(0, calls.length);
  runShouldFail = false;
});

describe("/projects/[id]/e2e +page.server.ts", () => {
  beforeAll(() => {
    suiteActive = true;
  });
  afterAll(() => {
    suiteActive = false;
  });

  test("server route delegates through service interfaces instead of direct application or ORM imports", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("@workflow-coordination/interface/http/workflow-api-client");
    expect(source).toContain("@planning-review/interface/project-review-reports");
    expect(source).toContain("$lib/server/request-service-scope");
    expect(source).not.toContain("@workflow-coordination/application/");
    expect(source).not.toContain("@planning-review/application/");
    expect(source).not.toContain("from \"typeorm\"");
    expect(source).not.toContain("@mikro-orm");
  });

  test("load returns generated E2E run history for the project", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: "project-1" },
      locals: {},
    } as Parameters<typeof mod.load>[0]);

    expect(result.projectId).toBe("project-1");
    expect(result.history).toEqual(history);
    expect(calls).toEqual(["history:project-1:20"]);
  });

  test("runE2e action sends trace, runner, and selected real-data test files through workflow API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.actions.runE2e({
      params: { id: "project-1" },
      request: form({
        runner: "playwright",
        traceId: "trace-custom",
        testFiles: "tests/e2e/workflow-end-to-end.test.ts, apps/web/tests/e2e/review-workbench.spec.ts",
      }),
      url: new URL("http://localhost/projects/project-1/e2e"),
      fetch,
      locals: {},
    } as Parameters<typeof mod.actions.runE2e>[0]);

    expect(result).toMatchObject({
      ok: true,
      mode: "runE2e",
      result: { status: "passed", runner: "playwright", traceId: "trace-custom" },
    });
    expect(calls).toEqual([
      "api:http://localhost:",
      "run:project-1:playwright:trace-custom:tests/e2e/workflow-end-to-end.test.ts|apps/web/tests/e2e/review-workbench.spec.ts",
    ]);
  });

  test("runE2e action rejects unsupported runners before dispatch", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.actions.runE2e({
      params: { id: "project-1" },
      request: form({ runner: "shell" }),
      url: new URL("http://localhost/projects/project-1/e2e"),
      fetch,
      locals: {},
    } as Parameters<typeof mod.actions.runE2e>[0]);

    expect(result.status).toBe(400);
    expect(result.data).toMatchObject({ ok: false, error: "runner must be bun or playwright" });
    expect(calls).toEqual([]);
  });

  test("runE2e action returns an action failure when workflow API dispatch fails", async () => {
    runShouldFail = true;
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.actions.runE2e({
      params: { id: "project-1" },
      request: form({ runner: "bun" }),
      url: new URL("http://localhost/projects/project-1/e2e"),
      fetch,
      locals: {},
    } as Parameters<typeof mod.actions.runE2e>[0]);

    expect(result.status).toBe(400);
    expect(result.data).toMatchObject({ ok: false, error: "runner unavailable" });
  });
});
