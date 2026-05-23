import { afterEach, describe, expect, test } from "bun:test";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const PROJECT_ID = "99999999-9999-4999-8999-999999999999";
const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];

afterEach(() => {
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

  test("loads manual task workbench data through the public task API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    const route = await import(`./+page.server.ts?workbenchCachebust=${Date.now()}`);
    const calls: string[] = [];
    const taskId = "task-web-workbench";
    const manualWorkbench = {
      projectId: PROJECT_ID,
      traceId: "trace-web-workbench",
      layout: "kanban",
      columns: [{ group: "started", taskIds: [taskId] }],
      listRows: [{ id: taskId, title: "Render manual task workbench", cycleId: "cycle-web" }],
    };
    const fetchImpl = (async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes("/api/trpc")) throw new Error("unexpected local bridge call");
      calls.push(target);
      if (target.includes("/api/v1/tasks/manual-workbench")) {
        return Response.json(manualWorkbench);
      }
      if (target.includes("/api/v1/tasks")) {
        return Response.json([{ id: taskId, title: "Render manual task workbench", status: "in_progress" }]);
      }
      throw new Error(`unexpected task API call: ${target}`);
    }) as typeof fetch;

    const result = await route.load({
      params: { id: PROJECT_ID },
      url: new URL("http://localhost/projects/x/board?trace=trace-web-workbench&view=board&stateGroup=started"),
      locals: { orgId: ORG_ID },
      request: new Request("http://localhost/projects/x/board", { headers: { cookie: "sid=session-1" } }),
      fetch: fetchImpl,
    } as Parameters<typeof route.load>[0]);
    const data = await result.streamed.data;

    expect(data).toMatchObject({
      manualWorkbench: {
        projectId: PROJECT_ID,
        traceId: "trace-web-workbench",
        layout: "kanban",
        columns: expect.arrayContaining([expect.objectContaining({ group: "started", taskIds: [taskId] })]),
        listRows: expect.arrayContaining([
          expect.objectContaining({ id: taskId, title: "Render manual task workbench", cycleId: "cycle-web" }),
        ]),
      },
    });
    expect(calls.some((url) => url.startsWith("http://127.0.0.1:3210/api/v1/tasks"))).toBe(true);
    const workbenchCall = calls.find((url) => url.includes("/api/v1/tasks/manual-workbench"));
    expect(workbenchCall).toBeDefined();
    expect(new URL(workbenchCall!).searchParams.get("traceId")).toBe("trace-web-workbench");
    expect(new URL(workbenchCall!).searchParams.get("viewMode")).toBe("board");
    expect(new URL(workbenchCall!).searchParams.get("stateGroups")).toBe("started");
  });

  test("returns dependency-aware dependency disclosure for selected board tasks", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    const route = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      if (target.includes("/api/trpc")) throw new Error("unexpected local bridge call");
      calls.push({ url: target, init: init ?? {} });
      return Response.json({
        requiresDisclosure: true,
        traceId: "trace-web-board-preview",
        orderedTaskIds: ["task-db", "task-release"],
      });
    }) as typeof fetch;
    const fd = new FormData();
    fd.set("taskIds", "task-release");
    fd.set("traceId", "trace-web-board-preview");

    const result = await route.actions.runPreview({
      params: { id: PROJECT_ID },
      request: new Request("http://localhost/projects/x/board", {
        method: "POST",
        body: fd,
        headers: { cookie: "sid=session-1" },
      }),
      locals: { orgId: ORG_ID },
      fetch: fetchImpl,
    } as Parameters<typeof route.actions.runPreview>[0]);

    expect(result).toMatchObject({
      ok: true,
      mode: "runPreview",
      preview: {
        requiresDisclosure: true,
        traceId: "trace-web-board-preview",
        orderedTaskIds: ["task-db", "task-release"],
      },
    });
    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:3210/workflows/execution/dependency-run/preview",
    ]);
    expect(calls[0]!.init.method).toBe("POST");
  });

  test("dispatches selected board dependency runs through the public workflow API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    const route = await import(`./+page.server.ts?dispatchCachebust=${Date.now()}`);
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      if (target.includes("/api/trpc")) throw new Error("unexpected local bridge call");
      calls.push({ url: target, init: init ?? {} });
      return Response.json({
        runGroupId: "trace-web-board-dispatch",
        scheduledRuns: [{ taskId: "task-release", agent: "codex", status: "queued" }],
        skippedTasks: [{ id: "task-db", reason: "already satisfied" }],
      });
    }) as typeof fetch;
    const fd = new FormData();
    fd.set("taskIds", "task-release");
    fd.set("agent", "codex");
    fd.set("model", "gpt-dependency");
    fd.set("traceId", "trace-web-board-dispatch");
    fd.set("prompt", "Ship web board dependency tree");

    const result = await route.actions.run({
      params: { id: PROJECT_ID },
      request: new Request("http://localhost/projects/x/board", {
        method: "POST",
        body: fd,
        headers: { cookie: "sid=session-1" },
      }),
      locals: { orgId: ORG_ID },
      fetch: fetchImpl,
    } as Parameters<typeof route.actions.run>[0]);

    expect(result).toMatchObject({
      ok: true,
      mode: "run",
      dispatch: {
        runGroupId: "trace-web-board-dispatch",
        scheduledRuns: [expect.objectContaining({ taskId: "task-release", agent: "codex", status: "queued" })],
        skippedTasks: [expect.objectContaining({ id: "task-db", reason: "already satisfied" })],
      },
    });
    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:3210/workflows/execution/dependency-run/dispatch",
    ]);
    expect(calls[0]!.init.method).toBe("POST");
  });

  test("records QA review verdicts through the public workflow API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    const route = await import(`./+page.server.ts?qaCachebust=${Date.now()}`);
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      if (target.includes("/api/trpc")) throw new Error("unexpected local bridge call");
      calls.push({ url: target, init: init ?? {} });
      return Response.json({
        taskId: "task-release",
        verdict: "REVISE",
        nextAction: "feedback_run_scheduled",
        feedbackRun: { taskId: "task-release", agent: "codex", status: "queued" },
      });
    }) as typeof fetch;
    const fd = new FormData();
    fd.set("taskId", "task-release");
    fd.set("traceId", "trace-web-qa");
    fd.set("reviewType", "code");
    fd.set("reviewerAgent", "qa-reviewer");
    fd.set("feedbackAgent", "codex");
    fd.set("reviewText", "### Verdict: REVISE\nBoard QA needs one more automated feedback loop.");

    const result = await route.actions.qaReview({
      params: { id: PROJECT_ID },
      request: new Request("http://localhost/projects/x/board", {
        method: "POST",
        body: fd,
        headers: { cookie: "sid=session-1" },
      }),
      locals: { orgId: ORG_ID },
      fetch: fetchImpl,
    } as Parameters<typeof route.actions.qaReview>[0]);

    expect(result).toMatchObject({
      ok: true,
      mode: "qaReview",
      review: {
        taskId: "task-release",
        verdict: "REVISE",
        nextAction: "feedback_run_scheduled",
        feedbackRun: expect.objectContaining({ taskId: "task-release", agent: "codex", status: "queued" }),
      },
    });
    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:3210/workflows/execution/qa-review/record",
    ]);
    expect(calls[0]!.init.method).toBe("POST");
  });
});
