import { afterEach, describe, expect, test } from "bun:test";

import { __setApplicationScopeForTest } from "$lib/server/application-scope";
import { createTestOrm } from "@test-support/application-database.ts";
import { createTask, setDependencies } from "@work-management/application/tasks/commands.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_ID = "99999999-9999-4999-8999-999999999999";
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

describe("/projects/[id]/board dependency run preview action", () => {
  test("uses the Nest workflow API for board run and QA actions when configured", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    const route = await import(`./+page.server.ts?boardWorkflowApiCachebust=${Date.now()}`);
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      if (target.includes("/api/trpc")) throw new Error("unexpected local bridge call");
      calls.push({ url: target, init: init ?? {} });
      if (target.includes("/dependency-run/dispatch")) {
        return Response.json({ runGroupId: "trace-public-board", scheduledRuns: [] });
      }
      if (target.includes("/qa-review/record")) {
        return Response.json({ taskId: "task-1", verdict: "REVISE", nextAction: "feedback_run_scheduled" });
      }
      return Response.json({ traceId: "trace-public-board", orderedTaskIds: ["task-1"] });
    }) as typeof fetch;

    const previewForm = new FormData();
    previewForm.set("taskIds", "task-1");
    previewForm.set("traceId", "trace-public-board");
    await expect(route.actions.runPreview({
      params: { id: PROJECT_ID },
      request: new Request("http://localhost/projects/project/board", {
        method: "POST",
        body: previewForm,
        headers: { cookie: "sid=session-1" },
      }),
      locals: { orgId: ORG_ID },
      fetch: fetchImpl,
    } as Parameters<typeof route.actions.runPreview>[0])).resolves.toMatchObject({
      ok: true,
      preview: { traceId: "trace-public-board" },
    });

    const runForm = new FormData();
    runForm.set("taskIds", "task-1");
    runForm.set("agent", "codex");
    runForm.set("traceId", "trace-public-board");
    await expect(route.actions.run({
      params: { id: PROJECT_ID },
      request: new Request("http://localhost/projects/project/board", {
        method: "POST",
        body: runForm,
        headers: { cookie: "sid=session-1" },
      }),
      locals: { orgId: ORG_ID },
      fetch: fetchImpl,
    } as Parameters<typeof route.actions.run>[0])).resolves.toMatchObject({
      ok: true,
      dispatch: { runGroupId: "trace-public-board" },
    });

    const reviewForm = new FormData();
    reviewForm.set("taskId", "task-1");
    reviewForm.set("traceId", "trace-public-board");
    reviewForm.set("reviewText", "### Verdict: REVISE");
    await expect(route.actions.qaReview({
      params: { id: PROJECT_ID },
      request: new Request("http://localhost/projects/project/board", {
        method: "POST",
        body: reviewForm,
        headers: { cookie: "sid=session-1" },
      }),
      locals: { orgId: ORG_ID },
      fetch: fetchImpl,
    } as Parameters<typeof route.actions.qaReview>[0])).resolves.toMatchObject({
      ok: true,
      review: { taskId: "task-1", nextAction: "feedback_run_scheduled" },
    });

    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:3210/workflows/execution/dependency-run/preview",
      "http://127.0.0.1:3210/workflows/execution/dependency-run/dispatch",
      "http://127.0.0.1:3210/workflows/execution/qa-review/record",
    ]);
    expect(calls.every((call) => call.init.method === "POST")).toBe(true);
    expect(calls.every((call) => (call.init.headers as Record<string, string>).cookie === "sid=session-1")).toBe(true);
  });

  test("loads manual task workbench data through the shared application action", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      await em.getConnection().execute(
        `insert into projects (id, org_id, name) values (?, ?, ?)`,
        [PROJECT_ID, ORG_ID, "Task Workbench Project"],
      );
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      const task = await createTask(em, ctx, {
        title: "Render manual task workbench",
        status: "in_progress",
        projectId: PROJECT_ID,
        cycleId: "cycle-web",
        moduleId: "module-board",
      });
      restoreScope = __setApplicationScopeForTest({ em, orgId: ORG_ID, userId: USER_ID });
      const route = await import(`./+page.server.ts?workbenchCachebust=${Date.now()}`);

      const result = await route.load({
        params: { id: PROJECT_ID },
        url: new URL("http://localhost/projects/x/board?trace=trace-web-workbench&view=board&stateGroup=started"),
        locals: {},
      } as Parameters<typeof route.load>[0]);
      const data = await result.streamed.data;

      expect(data).toMatchObject({
        manualWorkbench: {
          projectId: PROJECT_ID,
          traceId: "trace-web-workbench",
          layout: "kanban",
          columns: expect.arrayContaining([expect.objectContaining({ group: "started", taskIds: [task.id] })]),
          listRows: expect.arrayContaining([expect.objectContaining({ id: task.id, title: "Render manual task workbench", cycleId: "cycle-web" })]),
        },
      });
    } finally {
      await db.close();
    }
  });

  test("returns dependency-aware dependency disclosure for selected board tasks", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      await em.getConnection().execute(
        `insert into projects (id, org_id, name) values (?, ?, ?)`,
        [PROJECT_ID, ORG_ID, "Board Preview Project"],
      );
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      const dbTask = await createTask(em, ctx, {
        title: "Provision database",
        status: "completed",
        projectId: PROJECT_ID,
      });
      const releaseTask = await createTask(em, ctx, {
        title: "Run release board",
        status: "pending",
        projectId: PROJECT_ID,
      });
      em.clear();
      await setDependencies(em, ctx, releaseTask.id, {
        blocks: [],
        blocked_by: [dbTask.id],
      });
      restoreScope = __setApplicationScopeForTest({ em, orgId: ORG_ID, userId: USER_ID });
      const route = await import(`./+page.server.ts?cachebust=${Date.now()}`);
      const fd = new FormData();
      fd.set("taskIds", releaseTask.id);
      fd.set("traceId", "trace-web-board-preview");

      const result = await route.actions.runPreview({
        params: { id: PROJECT_ID },
        request: new Request("http://localhost/projects/x/board", { method: "POST", body: fd }),
        locals: {},
      } as Parameters<typeof route.actions.runPreview>[0]);

      expect(result).toMatchObject({
        ok: true,
        mode: "runPreview",
        preview: {
          requiresDisclosure: true,
          traceId: "trace-web-board-preview",
          orderedTaskIds: [dbTask.id, releaseTask.id],
        },
      });
    } finally {
      await db.close();
    }
  });

  test("dispatches selected board dependency runs through the shared application action", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      await em.getConnection().execute(
        `insert into projects (id, org_id, name) values (?, ?, ?)`,
        [PROJECT_ID, ORG_ID, "Board Dispatch Project"],
      );
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      const dbTask = await createTask(em, ctx, {
        title: "Provision database",
        status: "completed",
        projectId: PROJECT_ID,
      });
      const releaseTask = await createTask(em, ctx, {
        title: "Run release board",
        status: "pending",
        projectId: PROJECT_ID,
      });
      em.clear();
      await setDependencies(em, ctx, releaseTask.id, {
        blocks: [],
        blocked_by: [dbTask.id],
      });
      restoreScope = __setApplicationScopeForTest({ em, orgId: ORG_ID, userId: USER_ID });
      const route = await import(`./+page.server.ts?dispatchCachebust=${Date.now()}`);
      const fd = new FormData();
      fd.set("taskIds", releaseTask.id);
      fd.set("agent", "codex");
      fd.set("model", "gpt-dependency");
      fd.set("traceId", "trace-web-board-dispatch");
      fd.set("prompt", "Ship web board dependency tree");

      const result = await route.actions.run({
        params: { id: PROJECT_ID },
        request: new Request("http://localhost/projects/x/board", { method: "POST", body: fd }),
        locals: {},
      } as Parameters<typeof route.actions.run>[0]);

      expect(result).toMatchObject({
        ok: true,
        mode: "run",
        dispatch: {
          runGroupId: "trace-web-board-dispatch",
          scheduledRuns: [expect.objectContaining({ taskId: releaseTask.id, agent: "codex", status: "queued" })],
          skippedTasks: [expect.objectContaining({ id: dbTask.id, reason: "already satisfied" })],
        },
      });
    } finally {
      await db.close();
    }
  });

  test("records QA review verdicts through the shared application action", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      await em.getConnection().execute(
        `insert into projects (id, org_id, name) values (?, ?, ?)`,
        [PROJECT_ID, ORG_ID, "Board QA Project"],
      );
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      const releaseTask = await createTask(em, ctx, {
        title: "Run release board",
        status: "in_progress",
        projectId: PROJECT_ID,
        descriptionText: "## Success Criteria\n- Board QA records trace-linked review feedback.",
      });
      restoreScope = __setApplicationScopeForTest({ em, orgId: ORG_ID, userId: USER_ID });
      const route = await import(`./+page.server.ts?qaCachebust=${Date.now()}`);
      const fd = new FormData();
      fd.set("taskId", releaseTask.id);
      fd.set("traceId", "trace-web-qa");
      fd.set("reviewType", "code");
      fd.set("reviewerAgent", "qa-reviewer");
      fd.set("feedbackAgent", "codex");
      fd.set("reviewText", "### Verdict: REVISE\nBoard QA needs one more automated feedback loop.");

      const result = await route.actions.qaReview({
        params: { id: PROJECT_ID },
        request: new Request("http://localhost/projects/x/board", { method: "POST", body: fd }),
        locals: {},
      } as Parameters<typeof route.actions.qaReview>[0]);

      expect(result).toMatchObject({
        ok: true,
        mode: "qaReview",
        review: {
          taskId: releaseTask.id,
          verdict: "REVISE",
          nextAction: "feedback_run_scheduled",
          feedbackRun: expect.objectContaining({ taskId: releaseTask.id, agent: "codex", status: "queued" }),
        },
      });
    } finally {
      await db.close();
    }
  });
});
