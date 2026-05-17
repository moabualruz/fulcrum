import { afterEach, describe, expect, test } from "bun:test";

import { __setApplicationScopeForTest } from "$lib/server/application-scope";
import { createTask, setDependencies } from "@work-management/application/tasks/commands.ts";
import { createTestOrm } from "@test-support/application-database.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_ID = "88888888-8888-4888-8888-888888888888";
const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];

let restoreScope: (() => void) | null = null;

afterEach(() => {
  restoreScope?.();
  restoreScope = null;
  if (originalServerUrl === undefined) delete process.env["FULCRUM_SERVER_URL"];
  else process.env["FULCRUM_SERVER_URL"] = originalServerUrl;
  if (originalPublicApiUrl === undefined) delete process.env["FULCRUM_PUBLIC_API_URL"];
  else process.env["FULCRUM_PUBLIC_API_URL"] = originalPublicApiUrl;
});

describe("/tasks/[id] dependency run actions", () => {
  test("uses the Nest workflow API when a server URL is configured", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    const route = await import(`./+page.server.ts?taskWorkflowApiCachebust=${Date.now()}`);
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      if (target.includes("/api/trpc")) throw new Error("unexpected local bridge call");
      calls.push({ url: target, init: init ?? {} });
      if (target.includes("/dependency-run/dispatch")) {
        return Response.json({ runGroupId: "trace-public-task", scheduledRuns: [] });
      }
      if (target.includes("/dependency-run/live-feedback")) {
        return Response.json({ traceId: "trace-public-task", executorStatus: { active: false } });
      }
      return Response.json({ traceId: "trace-public-task", orderedTaskIds: ["task-1"] });
    }) as typeof fetch;

    const previewForm = new FormData();
    previewForm.set("traceId", "trace-public-task");
    await expect(route.actions.runPreview({
      params: { id: "task-1" },
      request: new Request("http://localhost/tasks/task-1", {
        method: "POST",
        body: previewForm,
        headers: { cookie: "sid=session-1" },
      }),
      locals: { activeProjectId: PROJECT_ID, orgId: ORG_ID },
      fetch: fetchImpl,
    } as Parameters<typeof route.actions.runPreview>[0])).resolves.toMatchObject({
      ok: true,
      preview: { traceId: "trace-public-task" },
    });

    const runForm = new FormData();
    runForm.set("traceId", "trace-public-task");
    runForm.set("agent", "codex");
    await expect(route.actions.run({
      params: { id: "task-1" },
      request: new Request("http://localhost/tasks/task-1", {
        method: "POST",
        body: runForm,
        headers: { cookie: "sid=session-1" },
      }),
      locals: { activeProjectId: PROJECT_ID, orgId: ORG_ID },
      fetch: fetchImpl,
    } as Parameters<typeof route.actions.run>[0])).resolves.toMatchObject({
      ok: true,
      dispatch: { runGroupId: "trace-public-task" },
    });

    const feedbackForm = new FormData();
    feedbackForm.set("traceId", "trace-public-task");
    await expect(route.actions.runFeedback({
      params: { id: "task-1" },
      request: new Request("http://localhost/tasks/task-1", {
        method: "POST",
        body: feedbackForm,
        headers: { cookie: "sid=session-1" },
      }),
      locals: { activeProjectId: PROJECT_ID, orgId: ORG_ID },
      fetch: fetchImpl,
    } as Parameters<typeof route.actions.runFeedback>[0])).resolves.toMatchObject({
      ok: true,
      feedback: { traceId: "trace-public-task" },
    });

    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:3210/workflows/execution/dependency-run/preview",
      "http://127.0.0.1:3210/workflows/execution/dependency-run/dispatch",
      "http://127.0.0.1:3210/workflows/execution/dependency-run/live-feedback",
    ]);
    expect(calls.every((call) => call.init.method === "POST")).toBe(true);
    expect(calls.every((call) => (call.init.headers as Record<string, string>).cookie === "sid=session-1")).toBe(true);
  });

  test("proxies task detail feedback streams from the Nest workflow API when configured", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    const route = await import(`./run-feedback/+server.ts?taskPublicFeedbackStreamCachebust=${Date.now()}`);
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const response = await route.GET({
      params: { id: "task-1" },
      url: new URL("http://localhost/tasks/task-1/run-feedback?traceId=trace-public-task&once=1"),
      request: new Request("http://localhost/tasks/task-1/run-feedback", {
        headers: { cookie: "sid=session-1" },
      }),
      locals: { activeProjectId: PROJECT_ID },
      fetch: async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(
          `event: feedback\ndata: ${JSON.stringify({ traceId: "trace-public-task", executorStatus: { active: false } })}\n\n`,
          {
            headers: {
              "content-type": "text/event-stream",
              "cache-control": "no-cache, no-transform",
            },
          },
        );
      },
    } as Parameters<typeof route.GET>[0]);

    expect(response.headers.get("content-type")).toBe("text/event-stream");
    await expect(response.text()).resolves.toContain('"traceId":"trace-public-task"');
    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:3210/workflows/execution/dependency-run/live-feedback/stream?projectId=88888888-8888-4888-8888-888888888888&traceId=trace-public-task&runGroupId=trace-public-task&taskId=task-1&once=1",
        init: {
          method: "GET",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            cookie: "sid=session-1",
          },
        },
      },
    ]);
  });

  test("returns dependency-aware dependency disclosure for the task detail action", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await em.getConnection().execute(
        `insert into projects (id, org_id, name) values (?, ?, ?)`,
        [PROJECT_ID, ORG_ID, "Task Detail Preview Project"],
      );
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      const dbTask = await createTask(em, ctx, {
        title: "Provision task detail data",
        status: "completed",
        projectId: PROJECT_ID,
      });
      const releaseTask = await createTask(em, ctx, {
        title: "Run task detail dependency tree",
        status: "pending",
        projectId: PROJECT_ID,
      });
      em.clear();
      await setDependencies(em, ctx, releaseTask.id, {
        blocks: [],
        blocked_by: [dbTask.id],
      });
      restoreScope = __setApplicationScopeForTest({ em, orgId: ORG_ID, userId: USER_ID });
      const route = await import(`./+page.server.ts?taskPreviewCachebust=${Date.now()}`);
      const fd = new FormData();
      fd.set("traceId", "trace-task-detail-preview");

      const result = await route.actions.runPreview({
        params: { id: releaseTask.id },
        request: new Request("http://localhost/tasks/x", { method: "POST", body: fd }),
        locals: { activeProjectId: PROJECT_ID },
      } as Parameters<typeof route.actions.runPreview>[0]);

      expect(result).toMatchObject({
        ok: true,
        mode: "runPreview",
        preview: {
          mode: "task",
          requiresDisclosure: true,
          traceId: "trace-task-detail-preview",
          targetTaskIds: [releaseTask.id],
          orderedTaskIds: [dbTask.id, releaseTask.id],
        },
      });
    } finally {
      await db.close();
    }
  });

  test("dispatches a task detail dependency run through the shared application action", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await em.getConnection().execute(
        `insert into projects (id, org_id, name) values (?, ?, ?)`,
        [PROJECT_ID, ORG_ID, "Task Detail Dispatch Project"],
      );
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      const dbTask = await createTask(em, ctx, {
        title: "Provision task detail dispatch",
        status: "completed",
        projectId: PROJECT_ID,
      });
      const releaseTask = await createTask(em, ctx, {
        title: "Dispatch task detail dependency tree",
        status: "pending",
        projectId: PROJECT_ID,
      });
      em.clear();
      await setDependencies(em, ctx, releaseTask.id, {
        blocks: [],
        blocked_by: [dbTask.id],
      });
      restoreScope = __setApplicationScopeForTest({ em, orgId: ORG_ID, userId: USER_ID });
      const route = await import(`./+page.server.ts?taskDispatchCachebust=${Date.now()}`);
      const fd = new FormData();
      fd.set("agent", "codex");
      fd.set("model", "gpt-task-detail");
      fd.set("traceId", "trace-task-detail-dispatch");
      fd.set("prompt", "Run this task detail dependency tree");

      const result = await route.actions.run({
        params: { id: releaseTask.id },
        request: new Request("http://localhost/tasks/x", { method: "POST", body: fd }),
        locals: { activeProjectId: PROJECT_ID },
      } as Parameters<typeof route.actions.run>[0]);

      expect(result).toMatchObject({
        ok: true,
        mode: "run",
        dispatch: {
          runGroupId: "trace-task-detail-dispatch",
          scheduledRuns: [expect.objectContaining({ taskId: releaseTask.id, agent: "codex", status: "queued" })],
          skippedTasks: [expect.objectContaining({ id: dbTask.id, reason: "already satisfied" })],
        },
      });
    } finally {
      await db.close();
    }
  });

  test("loads task detail dependency-run live feedback through the shared application action", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await em.getConnection().execute(
        `insert into projects (id, org_id, name) values (?, ?, ?)`,
        [PROJECT_ID, ORG_ID, "Task Detail Feedback Project"],
      );
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      const releaseTask = await createTask(em, ctx, {
        title: "Render task detail live feedback",
        status: "pending",
        projectId: PROJECT_ID,
      });
      await import("@execution-orchestration/application/dependency-run-actions.ts").then((mod) =>
        mod.dispatchDependencyRunForTasks(em, ctx, {
          mode: "task",
          targetTaskIds: [releaseTask.id],
          projectId: PROJECT_ID,
          traceId: "trace-task-detail-feedback",
          agent: "codex",
        })
      );
      restoreScope = __setApplicationScopeForTest({ em, orgId: ORG_ID, userId: USER_ID });
      const route = await import(`./+page.server.ts?taskFeedbackCachebust=${Date.now()}`);
      const fd = new FormData();
      fd.set("traceId", "trace-task-detail-feedback");

      const result = await route.actions.runFeedback({
        params: { id: releaseTask.id },
        request: new Request("http://localhost/tasks/x", { method: "POST", body: fd }),
        locals: { activeProjectId: PROJECT_ID },
      } as Parameters<typeof route.actions.runFeedback>[0]);

      expect(result).toMatchObject({
        ok: true,
        mode: "runFeedback",
        feedback: {
          traceId: "trace-task-detail-feedback",
          runGroupId: "trace-task-detail-feedback",
          executorStatus: { queuedTaskCount: 1, active: true },
          runs: [expect.objectContaining({ taskId: releaseTask.id, status: "queued" })],
          events: [expect.objectContaining({ mutationType: "dependency_tree_dispatched" })],
        },
      });
    } finally {
      await db.close();
    }
  });

  test("streams task detail dependency-run feedback through a server event response", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await em.getConnection().execute(
        `insert into projects (id, org_id, name) values (?, ?, ?)`,
        [PROJECT_ID, ORG_ID, "Task Detail Feedback Stream Project"],
      );
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      const releaseTask = await createTask(em, ctx, {
        title: "Stream task detail run feedback",
        status: "pending",
        projectId: PROJECT_ID,
      });
      await import("@execution-orchestration/application/dependency-run-actions.ts").then((mod) =>
        mod.dispatchDependencyRunForTasks(em, ctx, {
          mode: "task",
          targetTaskIds: [releaseTask.id],
          projectId: PROJECT_ID,
          traceId: "trace-task-detail-feedback-stream",
          agent: "codex",
        })
      );
      restoreScope = __setApplicationScopeForTest({ em, orgId: ORG_ID, userId: USER_ID });
      const route = await import(`./run-feedback/+server.ts?taskFeedbackStreamCachebust=${Date.now()}`);

      const response = await route.GET({
        params: { id: releaseTask.id },
        url: new URL("http://localhost/tasks/x/run-feedback?traceId=trace-task-detail-feedback-stream&once=1"),
        locals: { activeProjectId: PROJECT_ID },
      } as Parameters<typeof route.GET>[0]);

      expect(response.headers.get("content-type")).toBe("text/event-stream");
      const body = await response.text();
      expect(body).toContain("event: feedback");
      expect(body).toContain('"traceId":"trace-task-detail-feedback-stream"');
      expect(body).toContain('"queuedTaskCount":1');
    } finally {
      await db.close();
    }
  });
});
