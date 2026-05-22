import { beforeEach, describe, expect, mock, test } from "bun:test";

// The task-detail run actions delegate to the workflow public API
// (`createWebWorkflowApiCaller` / `webWorkflowApiUrl`). Mocking that seam
// keeps this a unit test: no TypeORM EntityManager, no application-scope
// override, no database seeding.
const PROJECT_ID = "88888888-8888-4888-8888-888888888888";
const ORG_ID = "00000000-0000-0000-0000-000000000001";

const calls: Array<{ method: string; input: unknown }> = [];
let workflowConfigured = true;

mock.module("$lib/server/workflow-api", () => ({
  // `null` models an unconfigured workflow API; the route must then `fail(400)`.
  createWebWorkflowApiCaller: () =>
    workflowConfigured
      ? {
          tasks: {
            previewDependencyRun: async (input: unknown) => {
              calls.push({ method: "tasks.previewDependencyRun", input });
              const target = (input as { targetTaskIds: string[] }).targetTaskIds;
              return {
                mode: "task",
                requiresDisclosure: true,
                traceId: (input as { traceId?: string }).traceId,
                targetTaskIds: target,
                orderedTaskIds: ["dep-task", ...target],
              };
            },
            dispatchDependencyRun: async (input: unknown) => {
              calls.push({ method: "tasks.dispatchDependencyRun", input });
              return {
                runGroupId: (input as { traceId?: string }).traceId,
                scheduledRuns: [{ taskId: (input as { targetTaskIds: string[] }).targetTaskIds[0], agent: "codex", status: "queued" }],
                skippedTasks: [],
              };
            },
            dependencyRunLiveFeedback: async (input: unknown) => {
              calls.push({ method: "tasks.dependencyRunLiveFeedback", input });
              return {
                traceId: (input as { traceId?: string }).traceId,
                runGroupId: (input as { traceId?: string }).traceId,
                executorStatus: { queuedTaskCount: 1, active: true },
                runs: [{ taskId: (input as { taskId: string }).taskId, status: "queued" }],
                events: [{ mutationType: "dependency_tree_dispatched" }],
              };
            },
          },
        }
      : null,
  webWorkflowApiUrl: (path: string, query: Record<string, string | null | undefined>) => {
    if (!workflowConfigured) return null;
    const url = new URL(path, "http://127.0.0.1:3210");
    for (const [key, value] of Object.entries(query)) {
      if (value) url.searchParams.set(key, value);
    }
    return url.toString();
  },
  workflowApiProjectMetadata: (_event: unknown, projectId: string) => ({
    workspaceId: ORG_ID,
    workspaceSlug: "workspace",
    workspaceName: "Workspace",
    projectId,
    projectSlug: "project",
    projectName: "Project",
  }),
}));

beforeEach(() => {
  calls.splice(0, calls.length);
  workflowConfigured = true;
});

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/tasks/task-1", { method: "POST", body: fd });
}

function actionEvent(taskId: string, request: Request) {
  return { params: { id: taskId }, request, locals: { activeProjectId: PROJECT_ID, orgId: ORG_ID }, fetch };
}

describe("/tasks/[id] dependency run actions", () => {
  test("runPreview delegates dependency disclosure to the workflow public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.actions.runPreview(
      actionEvent("task-1", form({ traceId: "trace-preview" })) as Parameters<typeof mod.actions.runPreview>[0],
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
    expect(calls).toEqual([
      { method: "tasks.previewDependencyRun", input: { projectId: PROJECT_ID, mode: "task", targetTaskIds: ["task-1"], traceId: "trace-preview" } },
    ]);
  });

  test("runPreview fails when the workflow public API is not configured", async () => {
    workflowConfigured = false;
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.actions.runPreview(
      actionEvent("task-1", form({ traceId: "trace-preview" })) as Parameters<typeof mod.actions.runPreview>[0],
    );
    expect(result).toMatchObject({ status: 400, data: { ok: false, mode: "runPreview" } });
    expect(calls).toEqual([]);
  });

  test("run dispatches a dependency run through the workflow public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.actions.run(
      actionEvent("task-1", form({ agent: "codex", model: "gpt-task", traceId: "trace-dispatch", prompt: "Run it" })) as Parameters<
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
    expect(calls).toEqual([
      {
        method: "tasks.dispatchDependencyRun",
        input: {
          workspaceId: ORG_ID,
          workspaceSlug: "workspace",
          workspaceName: "Workspace",
          projectId: PROJECT_ID,
          projectSlug: "project",
          projectName: "Project",
          mode: "task",
          targetTaskIds: ["task-1"],
          traceId: "trace-dispatch",
          agent: "codex",
          model: "gpt-task",
          prompt: "Run it",
        },
      },
    ]);
  });

  test("runFeedback loads dependency-run live feedback through the workflow public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.actions.runFeedback(
      actionEvent("task-1", form({ traceId: "trace-feedback" })) as Parameters<typeof mod.actions.runFeedback>[0],
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
    expect(calls).toEqual([
      {
        method: "tasks.dependencyRunLiveFeedback",
        input: { projectId: PROJECT_ID, traceId: "trace-feedback", runGroupId: undefined, runId: undefined, taskId: "task-1" },
      },
    ]);
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
