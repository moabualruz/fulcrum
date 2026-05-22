import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { WorkflowApiError } from "@workflow-coordination/interface/http/workflow-api-client";

const calls: Array<{ method: string; input: unknown }> = [];
let handoffStatus = "ready";
let handoffError: unknown;
let decisionStatus = "approved";

mock.module("$lib/server/project-api", () => ({
  activeOrgId: () => "org-1",
  currentUserId: (locals: { userId?: string | null }) => locals.userId ?? null,
  createProjectApiForEvent: () => ({
    projects: {
      get: async (input: unknown) => {
        calls.push({ method: "projects.get", input });
        return { id: (input as { id: string }).id, name: "Project 1" };
      },
    },
  }),
  ensureProjectExists: async (_event: unknown, projectId: string) => {
    calls.push({ method: "ensureProjectExists", input: projectId });
  },
}));

mock.module("$lib/server/workflow-api", () => ({
  webWorkflowApiUrl: () => null,
  workflowApiProjectMetadata: (_event: unknown, projectId: string) => ({ orgId: "org-1", userId: "user-1", projectId }),
  createWebWorkflowApiCaller: () => ({
    reports: {
      uatCodeReviewHandoff: async (input: unknown) => {
        calls.push({ method: "reports.uatCodeReviewHandoff", input });
        if (handoffError) throw handoffError;
        return {
          projectId: (input as { projectId: string }).projectId,
          status: handoffStatus,
          finalQaStatus: "passed",
          nextAction: "prompt_user_for_uat_code_review",
          decisionOptions: [
            { id: "approve_without_manual_review", label: "Approve", description: "Approve." },
            { id: "request_changes", label: "Request Changes", description: "Send feedback." },
          ],
          promptMarkdown: "# UAT Prompt",
        };
      },
      recordUatCodeReviewDecision: async (input: unknown) => {
        calls.push({ method: "reports.recordUatCodeReviewDecision", input });
        return { projectId: (input as { projectId: string }).projectId, status: decisionStatus };
      },
    },
  }),
}));

beforeEach(() => {
  calls.splice(0, calls.length);
  handoffStatus = "ready";
  handoffError = undefined;
  decisionStatus = "approved";
});

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/projects/project-1/uat", { method: "POST", body: fd });
}

describe("/projects/[id]/uat +page.server.ts", () => {
  test("server route uses project and workflow public APIs instead of request service scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("ensureProjectExists");
    expect(source).toContain("createWebWorkflowApiCaller");
    expect(source).not.toContain("requestServiceScope");
    expect(source).not.toContain("@planning-review/interface/project-review-reports");
  });

  test("load returns handoff data for a project", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: "project-1" },
      locals: {},
    } as Parameters<typeof mod.load>[0]);

    expect(result.projectId).toBe("project-1");
    expect(result.handoff).toMatchObject({ projectId: "project-1", status: "ready", finalQaStatus: "passed" });
    expect(calls).toEqual([
      { method: "ensureProjectExists", input: "project-1" },
      { method: "reports.uatCodeReviewHandoff", input: { orgId: "org-1", userId: "user-1", projectId: "project-1" } },
    ]);
  });

  test("load returns null handoff on non-404 workflow error", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    handoffError = new Error("handoff not ready");
    const result = await mod.load({
      params: { id: "project-1" },
      locals: {},
    } as Parameters<typeof mod.load>[0]);

    expect(result).toEqual({ projectId: "project-1", handoff: null });
    expect(calls.map((call) => call.method)).toEqual(["ensureProjectExists", "reports.uatCodeReviewHandoff"]);
  });

  test("load throws 404 for public API not-found handoff", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    handoffError = new WorkflowApiError("Project not found", 404);
    await expect(mod.load({
      params: { id: "missing" },
      locals: {},
    } as Parameters<typeof mod.load>[0])).rejects.toMatchObject({ status: 404 });
  });

  test("decide action records approval and returns redirect to reports", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    decisionStatus = "approved";
    const result = await mod.actions.decide({
      params: { id: "project-1" },
      locals: {},
      request: form({ decision: "approve_without_manual_review", traceId: "trace-1", feedbackText: "ship it", taskIds: "task-1,task-2" }),
    } as Parameters<typeof mod.actions.decide>[0]);

    expect(result).toMatchObject({ ok: true, mode: "decide", decision: { status: "approved" }, redirectTo: "/projects/project-1/reports" });
    expect(calls).toEqual([
      {
        method: "reports.recordUatCodeReviewDecision",
        input: {
          orgId: "org-1",
          userId: "user-1",
          projectId: "project-1",
          traceId: "trace-1",
          decision: "approve_without_manual_review",
          reviewType: "uat",
          feedbackText: "ship it",
          taskIds: ["task-1", "task-2"],
        },
      },
    ]);
  });

  test("decide action records request_changes and returns redirect to review", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    decisionStatus = "changes_requested";
    const result = await mod.actions.decide({
      params: { id: "project-1" },
      locals: {},
      request: form({ decision: "request_changes" }),
    } as Parameters<typeof mod.actions.decide>[0]);

    expect(result).toMatchObject({ ok: true, mode: "decide", decision: { status: "changes_requested" }, redirectTo: "/projects/project-1/review" });
    expect(calls[0]).toMatchObject({
      method: "reports.recordUatCodeReviewDecision",
      input: { projectId: "project-1", decision: "request_changes", reviewType: "uat" },
    });
  });

  test("decide action returns error on invalid decision", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 5}`);
    const result = await mod.actions.decide({
      params: { id: "project-1" },
      locals: {},
      request: form({ decision: "maybe" }),
    } as Parameters<typeof mod.actions.decide>[0]) as { status: number; data: unknown };

    expect(result.status).toBe(400);
    expect(result.data).toEqual({ ok: false, mode: "decide", message: "Unsupported UAT decision: maybe" });
    expect(calls).toEqual([]);
  });

  test("decide action defaults to approve_without_manual_review when empty", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 6}`);
    await mod.actions.decide({
      params: { id: "project-1" },
      locals: {},
      request: form({ decision: "" }),
    } as Parameters<typeof mod.actions.decide>[0]);

    expect(calls).toEqual([
      {
        method: "reports.recordUatCodeReviewDecision",
        input: {
          orgId: "org-1",
          userId: "user-1",
          projectId: "project-1",
          decision: "approve_without_manual_review",
          reviewType: "uat",
          taskIds: [],
        },
      },
    ]);
  });
});
