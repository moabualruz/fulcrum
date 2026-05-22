import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: Array<{ method: string; input: unknown }> = [];

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
  token_used: 4200,
  cost_usd: "0.0123",
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

mock.module("$lib/server/agent-run-api", () => ({
  createAgentRunApiForEvent: () => ({
    runs: {
      pageDetail: async (input: { id: string; projectId: string }) => {
        calls.push({ method: "pageDetail", input });
        if (input.id === "not-found") throw new Error("Run not found");
        return mockPageData;
      },
      cancel: async (input: { id: string }) => {
        calls.push({ method: "cancel", input });
        return { ok: true };
      },
      retry: async (input: { id: string }) => {
        calls.push({ method: "retry", input });
        return { id: "run-2" };
      },
      recordApprovalDecision: async (input: unknown) => {
        calls.push({ method: "recordApprovalDecision", input });
        return { ok: true };
      },
    },
  }),
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
  test("server route uses the agent run public API instead of request service scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("createAgentRunApiForEvent");
    expect(source).not.toContain("requestServiceScope");
    expect(source).not.toContain("@execution-orchestration/interface/run-pages");
    expect(source).not.toContain("@execution-orchestration/interface/run-actions");
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
    expect(payload.run.token_used).toBe(4200);
    expect(payload.run.cost_usd).toBe("0.0123");
    expect(payload.events).toHaveLength(1);
    expect(payload.events[0].verb).toBe("run.started");
    expect(calls).toEqual([{ method: "pageDetail", input: { id: "run-1", projectId: "project-1" } }]);
  });

  test("cancel action delegates through the agent run public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.actions.cancel({
      params: { id: "project-1", runId: "run-1" },
      locals: {},
      request: form({}),
    } as Parameters<typeof mod.actions.cancel>[0]);

    expect(result).toEqual({ ok: true, message: "Run cancelled" });
    expect(calls).toEqual([{ method: "cancel", input: { id: "run-1" } }]);
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
    expect(calls).toEqual([{ method: "retry", input: { id: "run-1" } }]);
  });

  test("approval action records the decision through the agent run public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.actions.approvalDecision({
      params: { id: "project-1", runId: "run-1" },
      locals: {},
      request: form({ approvalId: "approval-1", decision: "approve" }),
    } as Parameters<typeof mod.actions.approvalDecision>[0]);

    expect(result).toEqual({ ok: true, message: "Approval decision recorded" });
    expect(calls).toEqual([
      {
        method: "recordApprovalDecision",
        input: {
          id: "run-1",
          projectId: "project-1",
          approvalId: "approval-1",
          decision: "approve",
          note: null,
        },
      },
    ]);
  });
});
