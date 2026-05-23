import { afterEach, beforeEach, describe, expect, test } from "bun:test";

// The task-detail run actions delegate to the workflow public API
// (`createWebWorkflowApiCaller`). The seam is exercised through a fake
// `event.fetch` plus `FULCRUM_SERVER_URL` — no `mock.module`, so sibling route
// suites in the same shard never get a hijacked workflow client. No TypeORM
// EntityManager, no database seeding.
const PROJECT_ID = "88888888-8888-4888-8888-888888888888";
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const SERVER_URL = "http://127.0.0.1:3210";
const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];

interface RecordedCall {
  method: string;
  pathname: string;
  body: Record<string, unknown>;
}

function workflowFetch(calls: RecordedCall[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};

    if (url.pathname === "/workflows/execution/dependency-run/preview" && method === "POST") {
      calls.push({ method: "tasks.previewDependencyRun", pathname: url.pathname, body });
      const target = (body as { targetTaskIds: string[] }).targetTaskIds;
      return Response.json({
        mode: "task",
        requiresDisclosure: true,
        traceId: (body as { traceId?: string }).traceId,
        targetTaskIds: target,
        orderedTaskIds: ["dep-task", ...target],
      });
    }

    if (url.pathname === "/workflows/execution/dependency-run/dispatch" && method === "POST") {
      calls.push({ method: "tasks.dispatchDependencyRun", pathname: url.pathname, body });
      return Response.json({
        runGroupId: (body as { traceId?: string }).traceId,
        scheduledRuns: [{ taskId: (body as { targetTaskIds: string[] }).targetTaskIds[0], agent: "codex", status: "queued" }],
        skippedTasks: [],
      });
    }

    if (url.pathname === "/workflows/execution/dependency-run/live-feedback" && method === "POST") {
      calls.push({ method: "tasks.dependencyRunLiveFeedback", pathname: url.pathname, body });
      return Response.json({
        traceId: (body as { traceId?: string }).traceId,
        runGroupId: (body as { traceId?: string }).traceId,
        executorStatus: { queuedTaskCount: 1, active: true },
        runs: [{ taskId: (body as { taskId: string }).taskId, status: "queued" }],
        events: [{ mutationType: "dependency_tree_dispatched" }],
      });
    }

    return Response.json({ message: `unexpected ${method} ${url.pathname}` }, { status: 500 });
  }) as typeof fetch;
}

beforeEach(() => {
  process.env["FULCRUM_SERVER_URL"] = SERVER_URL;
  delete process.env["FULCRUM_PUBLIC_API_URL"];
});

afterEach(() => {
  if (originalServerUrl === undefined) delete process.env["FULCRUM_SERVER_URL"];
  else process.env["FULCRUM_SERVER_URL"] = originalServerUrl;
  if (originalPublicApiUrl === undefined) delete process.env["FULCRUM_PUBLIC_API_URL"];
  else process.env["FULCRUM_PUBLIC_API_URL"] = originalPublicApiUrl;
});

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/tasks/task-1", { method: "POST", body: fd });
}

function actionEvent(taskId: string, request: Request, fetchImpl: typeof fetch) {
  return {
    params: { id: taskId },
    request,
    locals: { activeProjectId: PROJECT_ID, orgId: ORG_ID },
    fetch: fetchImpl,
  };
}

describe("/tasks/[id] dependency run actions", () => {
  test("runPreview delegates dependency disclosure to the workflow public API", async () => {
    const calls: RecordedCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.actions.runPreview(
      actionEvent("task-1", form({ traceId: "trace-preview" }), workflowFetch(calls)) as Parameters<typeof mod.actions.runPreview>[0],
    );

    expect(result).toMatchObject({
      ok: true,
      mode: "runPreview",
      preview: {
        mode: "task",
        requiresDisclosure: true,
        traceId: "trace-preview",
        targetTaskIds: ["task-1"],
        orderedTaskIds: ["dep-task", "task-1"],
      },
    });
    expect(calls.map((call) => call.method)).toEqual(["tasks.previewDependencyRun"]);
    expect(calls[0]!.pathname).toBe("/workflows/execution/dependency-run/preview");
    expect(calls[0]!.body).toMatchObject({ projectId: PROJECT_ID, mode: "task", targetTaskIds: ["task-1"], traceId: "trace-preview" });
  });

  test("runPreview fails when the workflow public API is not configured", async () => {
    // No base URL anywhere: `createWebWorkflowApiCaller` returns null.
    delete process.env["FULCRUM_SERVER_URL"];
    delete process.env["FULCRUM_PUBLIC_API_URL"];
    const calls: RecordedCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.actions.runPreview(
      actionEvent("task-1", form({ traceId: "trace-preview" }), workflowFetch(calls)) as Parameters<typeof mod.actions.runPreview>[0],
    );
    expect(result).toMatchObject({ status: 400, data: { ok: false, mode: "runPreview" } });
    expect(calls).toEqual([]);
  });

  test("run dispatches a dependency run through the workflow public API", async () => {
    const calls: RecordedCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.actions.run(
      actionEvent("task-1", form({ agent: "codex", model: "gpt-task", traceId: "trace-dispatch", prompt: "Run it" }), workflowFetch(calls)) as Parameters<
        typeof mod.actions.run
      >[0],
    );

    expect(result).toMatchObject({
      ok: true,
      mode: "run",
      dispatch: {
        runGroupId: "trace-dispatch",
        scheduledRuns: [expect.objectContaining({ taskId: "task-1", agent: "codex", status: "queued" })],
      },
    });
    expect(calls.map((call) => call.method)).toEqual(["tasks.dispatchDependencyRun"]);
    expect(calls[0]!.body).toMatchObject({
      workspaceId: ORG_ID,
      projectId: PROJECT_ID,
      mode: "task",
      targetTaskIds: ["task-1"],
      traceId: "trace-dispatch",
      agent: "codex",
      model: "gpt-task",
      prompt: "Run it",
    });
  });

  test("runFeedback loads dependency-run live feedback through the workflow public API", async () => {
    const calls: RecordedCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.actions.runFeedback(
      actionEvent("task-1", form({ traceId: "trace-feedback" }), workflowFetch(calls)) as Parameters<typeof mod.actions.runFeedback>[0],
    );

    expect(result).toMatchObject({
      ok: true,
      mode: "runFeedback",
      feedback: {
        traceId: "trace-feedback",
        runGroupId: "trace-feedback",
        executorStatus: { queuedTaskCount: 1, active: true },
        runs: [expect.objectContaining({ taskId: "task-1", status: "queued" })],
        events: [expect.objectContaining({ mutationType: "dependency_tree_dispatched" })],
      },
    });
    expect(calls.map((call) => call.method)).toEqual(["tasks.dependencyRunLiveFeedback"]);
    expect(calls[0]!.body).toMatchObject({ projectId: PROJECT_ID, traceId: "trace-feedback", taskId: "task-1" });
  });

  test("run-feedback endpoint streams feedback through the workflow public API", async () => {
    const mod = await import(`./run-feedback/+server.ts?cachebust=${Date.now() + 4}`);
    const fetched: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      fetched.push(String(url));
      return new Response(
        `event: feedback\ndata: ${JSON.stringify({ traceId: "trace-stream" })}\n\n`,
        { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform" } },
      );
    }) as typeof fetch;

    const response = await mod.GET({
      params: { id: "task-1" },
      url: new URL("http://localhost/tasks/task-1/run-feedback?traceId=trace-stream&once=1"),
      request: new Request("http://localhost/tasks/task-1/run-feedback", { headers: { cookie: "sid=session-1" } }),
      locals: { activeProjectId: PROJECT_ID },
      fetch: fetchImpl,
    } as Parameters<typeof mod.GET>[0]);

    expect(response.headers.get("content-type")).toBe("text/event-stream");
    await expect(response.text()).resolves.toContain('"traceId":"trace-stream"');
    expect(fetched).toHaveLength(1);
    expect(fetched[0]).toContain("/workflows/execution/dependency-run/live-feedback/stream");
    expect(fetched[0]).toContain(`projectId=${PROJECT_ID}`);
    expect(fetched[0]).toContain("traceId=trace-stream");
  });
});
