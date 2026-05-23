import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

// The board route delegates board reads/writes to the task public API
// (`/api/v1/tasks/...`) and the local-fallback run/QA actions to the workflow
// public API (`/workflows/execution/...`). Both seams are exercised through a
// fake `event.fetch` plus `FULCRUM_SERVER_URL` — no `mock.module`, so sibling
// route suites sharing the shard never inherit a hijacked client.
const ORG_ID = "org-1";
const SERVER_URL = "http://127.0.0.1:3210";
const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];

const boardTasks = [
  {
    id: "task-1",
    title: "Move me",
    status: "pending",
    priority: 0,
    project_id: "project-1",
    sprint_id: null,
    updated_at: "2026-05-15T00:00:00.000Z",
  },
];
const workbench = {
  projectId: "project-1",
  traceId: "trace-1",
  layout: "kanban",
  columns: [{ group: "started", label: "Started", color: "#f59e0b", taskIds: ["task-1"], count: 1 }],
  listRows: [{ id: "task-1", title: "Move me", stateGroup: "started", cycleId: "cycle-1" }],
  table: { visibleColumns: [], rows: [] },
  filtersApplied: 1,
  accessSpecifiers: [],
  emptyState: { allTasksEmpty: false, visibleTasksEmpty: false, message: "" },
};

interface RecordedCall {
  method: string;
  pathname: string;
  search: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

function fakeFetch(calls: RecordedCall[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    const search = Object.fromEntries(url.searchParams.entries());

    // --- Task public API -------------------------------------------------
    if (url.pathname === "/api/v1/tasks/manual-workbench" && method === "GET") {
      calls.push({ method: "tasks.manualWorkbench", pathname: url.pathname, search, body });
      return Response.json(workbench);
    }
    if (url.pathname === "/api/v1/tasks" && method === "GET") {
      calls.push({ method: "tasks.list", pathname: url.pathname, search, body });
      return Response.json(boardTasks);
    }
    if (url.pathname === "/api/v1/tasks" && method === "POST") {
      calls.push({ method: "tasks.create", pathname: url.pathname, search, body });
      return Response.json({ id: "task-new" }, { status: 201 });
    }
    if (/^\/api\/v1\/tasks\/[^/]+$/.test(url.pathname) && method === "PATCH") {
      calls.push({ method: "tasks.update", pathname: url.pathname, search, body });
      return Response.json({ ok: true });
    }
    if (/^\/api\/v1\/tasks\/[^/]+$/.test(url.pathname) && method === "DELETE") {
      calls.push({ method: "tasks.delete", pathname: url.pathname, search, body });
      return Response.json({ ok: true });
    }

    // --- Workflow public API --------------------------------------------
    if (url.pathname === "/workflows/execution/dependency-run/preview" && method === "POST") {
      calls.push({ method: "workflow.tasks.previewDependencyRun", pathname: url.pathname, search, body });
      return Response.json({
        traceId: (body as { traceId?: string }).traceId,
        orderedTaskIds: (body as { targetTaskIds: string[] }).targetTaskIds,
      });
    }
    if (url.pathname === "/workflows/execution/dependency-run/dispatch" && method === "POST") {
      calls.push({ method: "workflow.tasks.dispatchDependencyRun", pathname: url.pathname, search, body });
      return Response.json({ runGroupId: (body as { traceId?: string }).traceId, scheduledRuns: [] });
    }
    if (url.pathname === "/workflows/execution/qa-review/record" && method === "POST") {
      calls.push({ method: "workflow.tasks.recordQaReview", pathname: url.pathname, search, body });
      return Response.json({ taskId: (body as { taskId: string }).taskId, verdict: "REVISE", nextAction: "feedback_run_scheduled" });
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
  return new Request("http://localhost/projects/project-1/board", { method: "POST", body: fd });
}

describe("/projects/[id]/board +page.server.ts", () => {
  test("server route uses public API clients instead of request service scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("createTaskApiForEvent");
    expect(source).toContain("createWebWorkflowApiCaller");
    expect(source).not.toContain("requestServiceScope");
    expect(source).not.toContain("@work-management/interface/project-board");
    expect(source).not.toContain("@execution-orchestration/interface/");
  });

  test("load returns project board and workbench data through task public API", async () => {
    const calls: RecordedCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: "project-1" },
      url: new URL("http://localhost/projects/project-1/board?sprint=active&trace=trace-1&view=board&stateGroup=started"),
      locals: { orgId: ORG_ID },
      request: new Request("http://localhost/projects/project-1/board"),
      fetch: fakeFetch(calls),
    } as Parameters<typeof mod.load>[0]);

    expect(result.projectId).toBe("project-1");
    expect(result.sprintFilter).toBe("active");
    const payload = await result.streamed.data;
    expect(payload.tasks).toEqual(boardTasks);
    expect(payload.manualWorkbench).toEqual(workbench);
    expect(calls.map((call) => call.method).sort()).toEqual(["tasks.list", "tasks.manualWorkbench"]);
    const listCall = calls.find((call) => call.method === "tasks.list")!;
    expect(listCall.search).toMatchObject({ projectId: "project-1" });
    const workbenchCall = calls.find((call) => call.method === "tasks.manualWorkbench")!;
    expect(workbenchCall.search).toMatchObject({
      projectId: "project-1",
      traceId: "trace-1",
      viewMode: "board",
      stateGroups: "started",
    });
  });

  test("create, update, delete, and move actions delegate through task public API", async () => {
    const calls: RecordedCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const eventBase = {
      params: { id: "project-1" },
      locals: { orgId: ORG_ID },
      url: new URL("http://localhost/projects/project-1/board"),
      fetch: fakeFetch(calls),
    };

    await mod.actions.create({ ...eventBase, request: form({ title: "New task", status: "pending" }) } as Parameters<typeof mod.actions.create>[0]);
    await mod.actions.update({ ...eventBase, request: form({ id: "task-1", title: "Renamed", status: "in_progress" }) } as Parameters<typeof mod.actions.update>[0]);
    await mod.actions.delete({ ...eventBase, request: form({ id: "task-1" }) } as Parameters<typeof mod.actions.delete>[0]);
    const move = await mod.actions.move({ ...eventBase, request: form({ id: "task-1", from: "pending", to: "completed" }) } as Parameters<typeof mod.actions.move>[0]);

    expect(move).toEqual({ ok: true, message: "Task moved" });
    expect(calls.map((call) => call.method)).toEqual([
      "tasks.create",
      "tasks.update",
      "tasks.delete",
      "tasks.update",
    ]);
    expect(calls[0]!.body).toMatchObject({ projectId: "project-1", title: "New task", status: "pending" });
    expect(calls[1]!.pathname).toBe("/api/v1/tasks/task-1");
    expect(calls[1]!.body).toMatchObject({ projectId: "project-1", title: "Renamed", status: "in_progress" });
    expect(calls[2]!.pathname).toBe("/api/v1/tasks/task-1");
    expect(calls[3]!.pathname).toBe("/api/v1/tasks/task-1");
    expect(calls[3]!.body).toMatchObject({ projectId: "project-1", status: "completed" });
  });

  test("local fallback run and review actions delegate through workflow public API", async () => {
    const calls: RecordedCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const eventBase = {
      params: { id: "project-1" },
      locals: { orgId: ORG_ID },
      url: new URL("http://localhost/projects/project-1/board"),
      fetch: fakeFetch(calls),
    };

    const preview = await mod.actions.runPreview({
      ...eventBase,
      request: form({ taskIds: "task-1,task-2", traceId: "trace-2" }),
    } as Parameters<typeof mod.actions.runPreview>[0]);
    const dispatch = await mod.actions.run({
      ...eventBase,
      request: form({ taskIds: "task-1", agent: "codex", traceId: "trace-3" }),
    } as Parameters<typeof mod.actions.run>[0]);
    const review = await mod.actions.qaReview({
      ...eventBase,
      request: form({ taskId: "task-1", traceId: "trace-4", reviewText: "needs follow-up" }),
    } as Parameters<typeof mod.actions.qaReview>[0]);

    expect(preview).toMatchObject({ ok: true, preview: { traceId: "trace-2" } });
    expect(dispatch).toMatchObject({ ok: true, dispatch: { runGroupId: "trace-3" } });
    expect(review).toMatchObject({ ok: true, review: { taskId: "task-1" } });
    expect(calls.map((call) => call.method)).toEqual([
      "workflow.tasks.previewDependencyRun",
      "workflow.tasks.dispatchDependencyRun",
      "workflow.tasks.recordQaReview",
    ]);
    expect(calls[0]!.body).toMatchObject({
      projectId: "project-1",
      mode: "board",
      targetTaskIds: ["task-1", "task-2"],
      traceId: "trace-2",
    });
    expect(calls[1]!.body).toMatchObject({
      projectId: "project-1",
      mode: "task",
      targetTaskIds: ["task-1"],
      traceId: "trace-3",
      agent: "codex",
    });
    expect(calls[2]!.body).toMatchObject({
      projectId: "project-1",
      taskId: "task-1",
      traceId: "trace-4",
      reviewType: "code",
      reviewText: "needs follow-up",
    });
  });
});
