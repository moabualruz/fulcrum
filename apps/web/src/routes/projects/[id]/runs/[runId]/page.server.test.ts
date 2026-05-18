import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: string[] = [];

const mockRun = {
  id: "run-1",
  org_id: "org-1",
  project_id: "project-1",
  agent: "codex",
  model: "claude-sonnet",
  prompt: "fix the bug",
  status: "succeeded",
  symphony_state: null,
  parent_run_id: null,
  started_at: "2026-05-15T10:00:00.000Z",
  ended_at: "2026-05-15T10:05:00.000Z",
  transcript_path: null,
  last_error_kind: null,
  retry_count: 0,
  workspace_path: "/tmp/workspace",
};

const mockEvents = [
  {
    id: "evt-1",
    org_id: "org-1",
    project_id: "project-1",
    subject_kind: "agent_run",
    subject_id: "run-1",
    verb: "run.started",
    payload: {},
    actor: "system",
    created_at: "2026-05-15T10:00:00.000Z",
  },
];

const mockPageData = {
  run: mockRun,
  transcript: "Hello world transcript",
  diff: "diff --git a/src/app.ts b/src/app.ts\n@@ -1 +1 @@\n-old\n+new\n",
  artifacts: [],
  events: mockEvents,
  approvalQueue: [],
};

mock.module("$lib/server/request-service-scope", () => ({
  requestServiceScope: async (_locals: unknown, projectId: string | null) => ({
    em: { kind: "mock-em" },
    ctx: { orgId: "org-1", userId: "user-1", projectId },
  }),
}));

mock.module("@execution-orchestration/interface/run-pages.ts", () => ({
  getProjectRunPageData: async (_em: unknown, _ctx: unknown, runId: string) => {
    calls.push(`getRunPage:${runId}`);
    if (runId === "not-found") throw new Error("Run not found");
    return mockPageData;
  },
  listProjectRuns: async () => [],
}));

mock.module("@execution-orchestration/interface/run-actions.ts", () => ({
  cancelRun: async (_em: unknown, _ctx: unknown, runId: string) => {
    calls.push(`cancel:${runId}`);
    return { ok: true };
  },
  retryRun: async (_em: unknown, _ctx: unknown, runId: string) => {
    calls.push(`retry:${runId}`);
    return { id: "run-2" };
  },
  recordRunApprovalDecision: async (_em: unknown, _ctx: unknown, input: { runId: string; approvalId: string; decision: string }) => {
    calls.push(`approval:${input.runId}:${input.approvalId}:${input.decision}`);
    return { ok: true };
  },
}));

mock.module("$lib/server/project-api", () => ({
  ensureProjectExists: async () => {},
}));

mock.module("$lib/feedback/action-result", () => ({
  actionOk: (msg: string) => ({ ok: true, message: msg }),
  actionFail: (msg: string) => ({ ok: false, message: msg }),
}));

beforeEach(() => {
  calls.splice(0, calls.length);
});

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  return new Request("http://localhost/projects/project-1/runs/run-1", { method: "POST", body: fd });
}

describe("/projects/[id]/runs/[runId] +page.server.ts", () => {
  test("server route imports from service interface boundaries, not application layer", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("@execution-orchestration/interface/run-pages");
    expect(source).toContain("@execution-orchestration/interface/run-actions");
    expect(source).toContain("$lib/server/request-service-scope");
    expect(source).not.toContain("@execution-orchestration/application/");
  });

  test("load returns run detail data with events and transcript", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: "project-1", runId: "run-1" },
      locals: {},
    } as Parameters<typeof mod.load>[0]);

    expect(result.projectId).toBe("project-1");
    const payload = await result.streamed.data;
    expect(payload.run.id).toBe("run-1");
    expect(payload.run.agent).toBe("codex");
    expect(payload.run.status).toBe("succeeded");
    expect(payload.transcript).toBe("Hello world transcript");
    expect(payload.diff).toContain("diff --git");
    expect(payload.events).toHaveLength(1);
    expect(payload.events[0].verb).toBe("run.started");
    expect(calls).toEqual(["getRunPage:run-1"]);
  });

  test("cancel action delegates through run-actions boundary", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.actions.cancel({
      params: { id: "project-1", runId: "run-1" },
      locals: {},
      request: form({}),
    } as Parameters<typeof mod.actions.cancel>[0]);

    expect(result).toEqual({ ok: true, message: "Run cancelled" });
    expect(calls).toEqual(["cancel:run-1"]);
  });

  test("retry action dispatches new run and redirects", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    try {
      await mod.actions.retry({
        params: { id: "project-1", runId: "run-1" },
        locals: {},
        request: form({}),
      } as Parameters<typeof mod.actions.retry>[0]);
      expect.unreachable("should have thrown redirect");
    } catch (err: unknown) {
      const redirectErr = err as { status: number; location: string };
      expect(redirectErr.status).toBe(303);
      expect(redirectErr.location).toBe("/projects/project-1/runs/run-2");
    }
    expect(calls).toEqual(["retry:run-1"]);
  });
});
