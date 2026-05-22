import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { WorkflowApiError } from "@workflow-coordination/interface/http/workflow-api-client";

const calls: Array<{ method: string; input: unknown }> = [];
let historyShouldFail = false;
let runShouldFail: unknown;

mock.module("$lib/server/workflow-api", () => ({
  webWorkflowApiUrl: () => null,
  workflowApiProjectMetadata: (_event: unknown, projectId: string) => ({ orgId: "org-1", userId: "user-1", projectId }),
  createWebWorkflowApiCaller: () => ({
    reports: {
      listGeneratedE2eRuns: async (input: unknown) => {
        calls.push({ method: "reports.listGeneratedE2eRuns", input });
        if (historyShouldFail) throw new Error("history unavailable");
        return [{ id: "e2e-1", runner: "bun", status: "passed" }];
      },
      runGeneratedE2eRegressionTests: async (input: unknown) => {
        calls.push({ method: "reports.runGeneratedE2eRegressionTests", input });
        if (runShouldFail) throw runShouldFail;
        return { id: "e2e-2", status: "queued" };
      },
    },
  }),
}));

beforeEach(() => {
  calls.splice(0, calls.length);
  historyShouldFail = false;
  runShouldFail = undefined;
});

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/projects/project-1/e2e", { method: "POST", body: fd });
}

describe("/projects/[id]/e2e +page.server.ts", () => {
  test("server route uses the workflow public API instead of request service scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("createWebWorkflowApiCaller");
    expect(source).not.toContain("requestServiceScope");
    expect(source).not.toContain("@planning-review/interface/project-review-reports");
  });

  test("load returns generated e2e history from workflow public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: "project-1" },
      locals: {},
    } as Parameters<typeof mod.load>[0]);

    expect(result).toEqual({ projectId: "project-1", history: [{ id: "e2e-1", runner: "bun", status: "passed" }] });
    expect(calls).toEqual([
      { method: "reports.listGeneratedE2eRuns", input: { orgId: "org-1", userId: "user-1", projectId: "project-1", limit: 20 } },
    ]);
  });

  test("load returns empty history when workflow history fails", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    historyShouldFail = true;
    const result = await mod.load({
      params: { id: "project-1" },
      locals: {},
    } as Parameters<typeof mod.load>[0]);

    expect(result).toEqual({ projectId: "project-1", history: [] });
    expect(calls).toEqual([
      { method: "reports.listGeneratedE2eRuns", input: { orgId: "org-1", userId: "user-1", projectId: "project-1", limit: 20 } },
    ]);
  });

  test("runE2e delegates runner, trace, and file filters to workflow public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.actions.runE2e({
      params: { id: "project-1" },
      locals: {},
      request: form({ runner: "playwright", traceId: "trace-1", testFiles: "a.spec.ts, b.spec.ts" }),
    } as Parameters<typeof mod.actions.runE2e>[0]);

    expect(result).toEqual({ ok: true, mode: "runE2e", result: { id: "e2e-2", status: "queued" } });
    expect(calls).toEqual([
      {
        method: "reports.runGeneratedE2eRegressionTests",
        input: {
          orgId: "org-1",
          userId: "user-1",
          projectId: "project-1",
          runner: "playwright",
          traceId: "trace-1",
          testFiles: ["a.spec.ts", "b.spec.ts"],
        },
      },
    ]);
  });

  test("runE2e validates runner before delegating", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.actions.runE2e({
      params: { id: "project-1" },
      locals: {},
      request: form({ runner: "vitest" }),
    } as Parameters<typeof mod.actions.runE2e>[0]) as { status: number; data: unknown };

    expect(result.status).toBe(400);
    expect(result.data).toEqual({ ok: false, error: "runner must be bun or playwright" });
    expect(calls).toEqual([]);
  });

  test("runE2e preserves public API error status", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    runShouldFail = new WorkflowApiError("No tests generated", 422);
    const result = await mod.actions.runE2e({
      params: { id: "project-1" },
      locals: {},
      request: form({ runner: "bun" }),
    } as Parameters<typeof mod.actions.runE2e>[0]) as { status: number; data: unknown };

    expect(result.status).toBe(422);
    expect(result.data).toEqual({ ok: false, error: "No tests generated" });
  });
});
