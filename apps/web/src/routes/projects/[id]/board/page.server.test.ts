import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

import { applicationScopeMock, useApplicationScope } from "$lib/test/application-scope-mock";

const calls: string[] = [];
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

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/projects/project-1/board", { method: "POST", body: fd });
}

// `mock.module` is process-wide and only one factory closure survives per
// path. `applicationScopeMock()` routes through a shared seam slot; this suite
// publishes its seam while active (beforeAll/afterAll) so sibling suites that
// mock the same path are never hijacked.
mock.module("$lib/server/application-scope", () => applicationScopeMock());

mock.module("@work-management/interface/project-board.ts", () => ({
  TASK_STATE_GROUP_ORDER: ["backlog", "unstarted", "started", "completed", "cancelled"],
  listProjectBoardWorkItems: async (_em: unknown, ctx: { projectId?: string | null }) => {
    calls.push(`list:${ctx.projectId ?? ""}`);
    return boardTasks;
  },
  buildProjectTaskWorkbench: async (_em: unknown, _ctx: unknown, input: { traceId?: string; viewMode?: string; filters?: { stateGroups?: string[] } }) => {
    calls.push(`workbench:${input.traceId ?? ""}:${input.viewMode ?? ""}:${input.filters?.stateGroups?.join("|") ?? ""}`);
    return workbench;
  },
  createProjectBoardWorkItem: async (_em: unknown, _ctx: unknown, input: { title: string; status?: string | null }) => {
    calls.push(`create:${input.title}:${input.status ?? ""}`);
    return { id: "task-new" };
  },
  updateProjectBoardWorkItem: async (_em: unknown, _ctx: unknown, id: string, patch: { status?: string | null; title?: string }) => {
    calls.push(`update:${id}:${patch.title ?? ""}:${patch.status ?? ""}`);
    return { ok: true };
  },
  deleteProjectBoardWorkItem: async (_em: unknown, _ctx: unknown, id: string) => {
    calls.push(`delete:${id}`);
    return { ok: true };
  },
}));

mock.module("@execution-orchestration/interface/dependency-run-actions.ts", () => ({
  previewDependencyRunForTasks: async (_em: unknown, _ctx: unknown, input: { targetTaskIds: string[]; traceId?: string }) => {
    calls.push(`preview:${input.targetTaskIds.join("|")}:${input.traceId ?? ""}`);
    return { traceId: input.traceId, orderedTaskIds: input.targetTaskIds };
  },
  dispatchDependencyRunForTasks: async (_em: unknown, _ctx: unknown, input: { targetTaskIds: string[]; agent: string; traceId?: string }) => {
    calls.push(`dispatch:${input.targetTaskIds.join("|")}:${input.agent}:${input.traceId ?? ""}`);
    return { runGroupId: input.traceId, scheduledRuns: [] };
  },
}));

mock.module("@execution-orchestration/interface/task-run-reviews.ts", () => ({
  recordTaskQaReview: async (_em: unknown, _ctx: unknown, input: { taskId: string; reviewText: string; traceId?: string }) => {
    calls.push(`review:${input.taskId}:${input.traceId ?? ""}:${input.reviewText}`);
    return { taskId: input.taskId, verdict: "REVISE", nextAction: "feedback_run_scheduled" };
  },
}));

beforeEach(() => {
  calls.splice(0, calls.length);
});

describe("/projects/[id]/board +page.server.ts", () => {
  let disposeScope: (() => void) | undefined;
  beforeAll(() => {
    disposeScope = useApplicationScope((_locals, projectId, taskId) => ({
      em: { kind: "mock-em" },
      ctx: { orgId: "org-1", userId: "user-1", projectId: projectId ?? null, taskId },
    }));
  });
  afterAll(() => {
    disposeScope?.();
  });

  test("server route uses service interfaces instead of direct application imports", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("@work-management/interface/project-board");
    expect(source).toContain("@execution-orchestration/interface/dependency-run-actions");
    expect(source).toContain("@execution-orchestration/interface/task-run-reviews");
    expect(source).toContain("$lib/server/request-service-scope");
    expect(source).not.toContain("@work-management/application/");
    expect(source).not.toContain("@execution-orchestration/application/");
    expect(source).not.toContain("$lib/server/application-scope");
  });

  test("load returns project board and workbench data through service boundaries", async () => {
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
    expect(calls).toEqual(["list:project-1", "workbench:trace-1:board:started"]);
  });

  test("create, update, delete, and move actions delegate through project board boundary", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const eventBase = { params: { id: "project-1" }, locals: {} };

    await mod.actions.create({ ...eventBase, request: form({ title: "New task", status: "pending" }) } as Parameters<typeof mod.actions.create>[0]);
    await mod.actions.update({ ...eventBase, request: form({ id: "task-1", title: "Renamed", status: "in_progress" }) } as Parameters<typeof mod.actions.update>[0]);
    await mod.actions.delete({ ...eventBase, request: form({ id: "task-1" }) } as Parameters<typeof mod.actions.delete>[0]);
    const move = await mod.actions.move({ ...eventBase, request: form({ id: "task-1", from: "pending", to: "completed" }) } as Parameters<typeof mod.actions.move>[0]);

    expect(move).toEqual({ ok: true, message: "Task moved" });
    expect(calls).toEqual([
      "create:New task:pending",
      "update:task-1:Renamed:in_progress",
      "delete:task-1",
      "update:task-1::completed",
    ]);
  });

  test("local fallback run and review actions delegate through orchestration boundaries", async () => {
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
      "preview:task-1|task-2:trace-2",
      "dispatch:task-1:codex:trace-3",
      "review:task-1:trace-4:needs follow-up",
    ]);
  });
});
