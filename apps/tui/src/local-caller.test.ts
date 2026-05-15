import { describe, expect, test } from "bun:test";

import {
  withAgentRunApiCaller,
  withAuditApiCaller,
  withDocumentApiCaller,
  withNotificationApiCaller,
  withWebhookApiCaller,
  withWorkflowApiCaller,
} from "./local-caller.ts";

describe("TUI document API caller", () => {
  test("overlays document calls with the configured Nest API caller", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const caller = withDocumentApiCaller({
      docs: {
        templates: {
          list: async () => [],
        },
      },
    }, {
      env: {
        FULCRUM_PUBLIC_API_URL: "http://127.0.0.1:4321/base/",
        FULCRUM_ORG_ID: "org-1",
      },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        if (String(url).includes("/attachments")) return Response.json([{ id: "attachment-1" }]);
        if (String(url).includes("/collaboration")) return Response.json([{ id: "state-1" }]);
        if (String(url).includes("/doc-1")) return Response.json({ id: "doc-1", title: "Doc" });
        return Response.json([{ id: "doc-1", title: "Doc" }]);
      }) as typeof fetch,
    });

    await expect(caller.docs.templates.list({})).resolves.toEqual([]);
    await expect(caller.docs.list({ projectId: "project-1" })).resolves.toEqual([{ id: "doc-1", title: "Doc" }]);
    await expect(caller.docs.get({ id: "doc-1" })).resolves.toEqual({ id: "doc-1", title: "Doc" });
    await expect(caller.docs.listAttachments({ docId: "doc-1" })).resolves.toEqual([{ id: "attachment-1" }]);
    await expect(caller.docs.listCollaborationStates({ docId: "doc-1" })).resolves.toEqual([{ id: "state-1" }]);

    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:4321/api/v1/docs?orgId=org-1&projectId=project-1",
      "http://127.0.0.1:4321/api/v1/docs/doc-1",
      "http://127.0.0.1:4321/api/v1/docs/doc-1/attachments",
      "http://127.0.0.1:4321/api/v1/docs/doc-1/collaboration",
    ]);
  });
});

describe("TUI notification API caller", () => {
  test("overlays notification calls with the configured Nest API caller", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const caller = withNotificationApiCaller({
      notify: {
        unreadCount: async () => ({ count: 0 }),
      },
    }, {
      env: {
        FULCRUM_PUBLIC_API_URL: "http://127.0.0.1:4321/base/",
        FULCRUM_ORG_ID: "org-1",
        FULCRUM_USER_ID: "user-1",
      },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return Response.json({ count: 3 });
      }) as typeof fetch,
    });

    await expect(caller.notify.unreadCount()).resolves.toEqual({ count: 3 });
    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:4321/api/v1/notifications/unread-count?orgId=org-1&userId=user-1",
        init: {
          method: "GET",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: undefined,
        },
      },
    ]);
  });
});

describe("TUI agent-run API caller", () => {
  test("overlays run list and detail calls with the configured Nest API caller", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const caller = withAgentRunApiCaller({
      agent_runs: {
        list: async (_input?: unknown) => [],
        get: async (input: { id: string }) => ({ id: input.id, status: "local" }),
        create: async (input: { taskId: string }) => ({ id: `local-${input.taskId}`, status: "queued" }),
        cancel: async () => ({ ok: true }),
      },
    }, {
      env: {
        FULCRUM_PUBLIC_API_URL: "http://127.0.0.1:4321/base/",
        FULCRUM_ORG_ID: "org-1",
      },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        if (String(url).includes("/api/v1/runs/run-1/cancel")) {
          return Response.json({ ok: true });
        }
        if (String(url).endsWith("/api/v1/runs?orgId=org-1") && init?.method === "POST") {
          return Response.json({ id: "public-task-1", status: "queued" });
        }
        if (String(url).includes("/api/v1/runs/run-1")) {
          return Response.json({ id: "run-1", status: "running", agent: "codex" });
        }
        return Response.json([{ id: "run-1", status: "running", agent: "codex" }]);
      }) as typeof fetch,
    });

    await expect(caller.agent_runs.list({ status: "running" })).resolves.toEqual([
      { id: "run-1", status: "running", agent: "codex" },
    ]);
    await expect(caller.agent_runs.get({ id: "run-1" })).resolves.toEqual({
      id: "run-1",
      status: "running",
      agent: "codex",
    });
    await expect(caller.agent_runs.create({ taskId: "task-1" })).resolves.toEqual({
      id: "public-task-1",
      status: "queued",
    });
    await expect(caller.agent_runs.cancel({ id: "run-1" })).resolves.toEqual({ ok: true });
    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:4321/api/v1/runs?orgId=org-1&status=running",
      "http://127.0.0.1:4321/api/v1/runs/run-1?orgId=org-1",
      "http://127.0.0.1:4321/api/v1/runs?orgId=org-1",
      "http://127.0.0.1:4321/api/v1/runs/run-1/cancel?orgId=org-1",
    ]);
  });
});

describe("TUI audit API caller", () => {
  test("overlays audit calls with the configured Nest API caller", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const caller = withAuditApiCaller({
      audit: {
        query: async (_input?: Record<string, unknown>) => [],
      },
    }, {
      env: {
        FULCRUM_PUBLIC_API_URL: "http://127.0.0.1:4321/base/",
        FULCRUM_ORG_ID: "org-1",
      },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        if (String(url).includes("/api/v1/audit/export")) {
          return Response.json([{ id: "audit-1", subjectKind: "task" }]);
        }
        return Response.json({ data: [{ id: "audit-1", subjectKind: "task" }], total: 1 });
      }) as typeof fetch,
    });

    await expect(caller.audit.query({
      subjectKind: "task",
      dateRange: { from: new Date("2026-05-14T00:00:00.000Z") },
    })).resolves.toEqual([{ id: "audit-1", subjectKind: "task" }]);
    await expect(caller.audit.export({ format: "json", subjectKind: "task" })).resolves.toEqual({
      format: "json",
      content: JSON.stringify([{ id: "audit-1", subjectKind: "task" }]),
    });
    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:4321/api/v1/audit?orgId=org-1&kind=task&since=2026-05-14T00%3A00%3A00.000Z",
        init: {
          method: "GET",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: undefined,
        },
      },
      {
        url: "http://127.0.0.1:4321/api/v1/audit/export?orgId=org-1&kind=task&format=json",
        init: {
          method: "GET",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: undefined,
        },
      },
    ]);
  });
});

describe("TUI webhook API caller", () => {
  test("overlays webhook calls with the configured Nest API caller", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const caller = withWebhookApiCaller({
      webhooks: {
        list: async () => [],
      },
    }, {
      env: {
        FULCRUM_PUBLIC_API_URL: "http://127.0.0.1:4321/base/",
        FULCRUM_ORG_ID: "org-1",
      },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return Response.json([{ id: "wh-1", url: "https://example.test/hook" }]);
      }) as typeof fetch,
    });

    await expect(caller.webhooks.list()).resolves.toEqual([{ id: "wh-1", url: "https://example.test/hook" }]);
    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:4321/api/v1/webhooks?orgId=org-1",
        init: {
          method: "GET",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: undefined,
        },
      },
    ]);
  });
});

describe("TUI workflow API caller", () => {
  test("overlays planning and workflow-cycle calls with the configured Nest API caller", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const caller = withWorkflowApiCaller({
      planning: {
        previewApprovedPlanBreakdown: async (_input: Record<string, unknown>) => ({ source: "local" }),
        materializeApprovedPlanBreakdown: async (_input: Record<string, unknown>) => ({ source: "local" }),
      },
      tasks: {
        previewDependencyRun: async (_input: Record<string, unknown>) => ({ source: "local" }),
        dispatchDependencyRun: async (_input: Record<string, unknown>) => ({ source: "local" }),
      },
      workflows: {
        runAcceptanceCycle: async (_input: Record<string, unknown>) => ({ source: "local" }),
      },
    }, {
      env: {
        FULCRUM_PUBLIC_API_URL: "http://127.0.0.1:4321/base/",
      },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        if (String(url).includes("/workflows/cycles/acceptance-cycle/run")) {
          return Response.json({ status: "accepted", traceId: "trace-1" });
        }
        if (String(url).includes("/workflows/execution/dependency-run/dispatch")) {
          return Response.json({ runGroupId: "group-1", traceId: "trace-1" });
        }
        if (String(url).includes("/workflows/execution/dependency-run/preview")) {
          return Response.json({ affectedTaskIds: ["task-1"], traceId: "trace-1" });
        }
        if (String(url).includes("/workflows/planning/freeform/start")) {
          return Response.json({ status: "ready_for_planning", traceId: "trace-1" });
        }
        if (String(url).includes("/workflows/planning/artifact-execution/run")) {
          return Response.json({ status: "passed", runner: "sandbox-agent", traceId: "trace-1" });
        }
        return Response.json({ title: "Preview", traceId: "trace-1" });
      }) as typeof fetch,
    });

    await expect(caller.planning.previewApprovedPlanBreakdown({
      planId: "plan-1",
      approvedPlanMarkdown: "# Plan",
    })).resolves.toEqual({ title: "Preview", traceId: "trace-1" });
    await expect(caller.planning.startFreeformWorkFromDocs?.({
      workspaceId: "workspace-1",
      workspaceSlug: "workspace",
      workspaceName: "Workspace",
      projectId: "project-1",
      projectSlug: "project",
      projectName: "Project",
      title: "Source",
      bodyMd: "Body",
      userPrompt: "Plan this",
    })).resolves.toEqual({ status: "ready_for_planning", traceId: "trace-1" });
    await expect(caller.tasks.previewDependencyRun({
      mode: "task",
      targetTaskIds: ["task-1"],
      tasks: [],
      traceId: "trace-1",
    })).resolves.toEqual({ affectedTaskIds: ["task-1"], traceId: "trace-1" });
    await expect(caller.tasks.dispatchDependencyRun({
      workspaceId: "workspace-1",
      workspaceSlug: "workspace",
      workspaceName: "Workspace",
      projectId: "project-1",
      projectSlug: "project",
      projectName: "Project",
      mode: "task",
      targetTaskIds: ["task-1"],
      traceId: "trace-1",
      agent: "codex",
    })).resolves.toEqual({ runGroupId: "group-1", traceId: "trace-1" });
    await expect(caller.workflows.runAcceptanceCycle({
      project: { traceId: "trace-1" },
    })).resolves.toEqual({ status: "accepted", traceId: "trace-1" });
    await expect(caller.planning.runArtifactExecution({
      planId: "plan-1",
      artifactPath: "apps/web/src/routes/planning/workbench-prototype.tsx",
      traceId: "trace-1",
    })).resolves.toEqual({ status: "passed", runner: "sandbox-agent", traceId: "trace-1" });

    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:4321/workflows/planning/approved-plan/preview",
      "http://127.0.0.1:4321/workflows/planning/freeform/start",
      "http://127.0.0.1:4321/workflows/execution/dependency-run/preview",
      "http://127.0.0.1:4321/workflows/execution/dependency-run/dispatch",
      "http://127.0.0.1:4321/workflows/cycles/acceptance-cycle/run",
      "http://127.0.0.1:4321/workflows/planning/artifact-execution/run",
    ]);
    expect(calls.every((call) => call.init.method === "POST")).toBe(true);
  });
});
