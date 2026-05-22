import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: Array<{ method: string; input: unknown }> = [];

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

mock.module("$lib/server/task-api", () => ({
  createTaskApiForEvent: () => ({
    tasks: {
      list: async (input: unknown) => {
        calls.push({ method: "tasks.list", input });
        return boardTasks;
      },
      manualWorkbench: async (input: unknown) => {
        calls.push({ method: "tasks.manualWorkbench", input });
        return workbench;
      },
      create: async (input: unknown) => {
        calls.push({ method: "tasks.create", input });
        return { id: "task-new" };
      },
      update: async (input: unknown) => {
        calls.push({ method: "tasks.update", input });
        return { ok: true };
      },
      delete: async (input: unknown) => {
        calls.push({ method: "tasks.delete", input });
        return { ok: true };
      },
    },
  }),
}));

mock.module("$lib/server/workflow-api", () => ({
  webWorkflowApiUrl: () => null,
  workflowApiProjectMetadata: (_event: unknown, projectId: string) => ({ orgId: "org-1", userId: "user-1", projectId }),
  createWebWorkflowApiCaller: () => ({
    tasks: {
      previewDependencyRun: async (input: unknown) => {
        calls.push({ method: "workflow.tasks.previewDependencyRun", input });
        return { traceId: (input as { traceId?: string }).traceId, orderedTaskIds: (input as { targetTaskIds: string[] }).targetTaskIds };
      },
      dispatchDependencyRun: async (input: unknown) => {
        calls.push({ method: "workflow.tasks.dispatchDependencyRun", input });
        return { runGroupId: (input as { traceId?: string }).traceId, scheduledRuns: [] };
      },
      recordQaReview: async (input: unknown) => {
        calls.push({ method: "workflow.tasks.recordQaReview", input });
        return { taskId: (input as { taskId: string }).taskId, verdict: "REVISE", nextAction: "feedback_run_scheduled" };
      },
    },
  }),
}));

beforeEach(() => {
  calls.splice(0, calls.length);
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
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: "project-1" },
      url: new URL("http://localhost/projects/project-1/board?sprint=active&trace=trace-1&view=board&stateGroup=started"),
      locals: {},
    } as Parameters<typeof mod.load>[0]);

    expect(result.projectId).toBe("project-1");
    expect(result.sprintFilter).toBe("active");
    const payload = await result.streamed.data;
    expect(payload.tasks).toEqual(boardTasks);
    expect(payload.manualWorkbench).toEqual(workbench);
    expect(calls).toEqual([
      { method: "tasks.list", input: { projectId: "project-1" } },
      {
        method: "tasks.manualWorkbench",
        input: {
          projectId: "project-1",
          traceId: "trace-1",
          viewMode: "board",
          filters: { stateGroups: ["started"] },
          projectCapabilities: { estimateEnabled: false },
        },
      },
    ]);
  });

  test("create, update, delete, and move actions delegate through task public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const eventBase = { params: { id: "project-1" }, locals: {} };

    await mod.actions.create({ ...eventBase, request: form({ title: "New task", status: "pending" }) } as Parameters<typeof mod.actions.create>[0]);
    await mod.actions.update({ ...eventBase, request: form({ id: "task-1", title: "Renamed", status: "in_progress" }) } as Parameters<typeof mod.actions.update>[0]);
    await mod.actions.delete({ ...eventBase, request: form({ id: "task-1" }) } as Parameters<typeof mod.actions.delete>[0]);
    const move = await mod.actions.move({ ...eventBase, request: form({ id: "task-1", from: "pending", to: "completed" }) } as Parameters<typeof mod.actions.move>[0]);

    expect(move).toEqual({ ok: true, message: "Task moved" });
    expect(calls).toEqual([
      { method: "tasks.create", input: { projectId: "project-1", title: "New task", status: "pending" } },
      { method: "tasks.update", input: { id: "task-1", projectId: "project-1", title: "Renamed", status: "in_progress" } },
      { method: "tasks.delete", input: { id: "task-1", projectId: "project-1" } },
      { method: "tasks.update", input: { id: "task-1", projectId: "project-1", status: "completed" } },
    ]);
  });

  test("local fallback run and review actions delegate through workflow public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const eventBase = { params: { id: "project-1" }, locals: {} };

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
    expect(calls).toEqual([
      {
        method: "workflow.tasks.previewDependencyRun",
        input: { orgId: "org-1", userId: "user-1", projectId: "project-1", mode: "board", targetTaskIds: ["task-1", "task-2"], traceId: "trace-2" },
      },
      {
        method: "workflow.tasks.dispatchDependencyRun",
        input: { orgId: "org-1", userId: "user-1", projectId: "project-1", mode: "task", targetTaskIds: ["task-1"], traceId: "trace-3", agent: "codex" },
      },
      {
        method: "workflow.tasks.recordQaReview",
        input: { orgId: "org-1", userId: "user-1", projectId: "project-1", taskId: "task-1", traceId: "trace-4", reviewType: "code", reviewText: "needs follow-up" },
      },
    ]);
  });
});
