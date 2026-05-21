import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

import { applicationScopeMock, useApplicationScope } from "$lib/test/application-scope-mock";

const appScope = { em: { kind: "mock-em" }, ctx: { orgId: "org-1", userId: "user-1", projectId: "project-1" } };
const calls: string[] = [];
const pageData = {
  project: { id: "project-1", name: "Project" },
  sprints: [{ id: "sprint-1", name: "Sprint 1", status: "active", capacity_points: 20 }],
  backlogTasks: [{ id: "task-1", title: "Backlog task", status: "pending", priority: 5, estimate_points: null, sprint_id: null }],
};

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/projects/project-1/backlog", { method: "POST", body: fd });
}

// `mock.module` is process-wide and only one factory closure survives per
// path. `applicationScopeMock()` routes through a shared seam slot; this suite
// publishes its seam while active (beforeAll/afterAll) so sibling suites that
// mock the same path are never hijacked.
mock.module("$lib/server/application-scope", () => applicationScopeMock());

mock.module("@work-management/interface/project-backlog.ts", () => ({
  loadProjectBacklog: async () => pageData,
  addTaskToSprint: async (_em: unknown, _ctx: unknown, sprintId: string, taskId: string) => {
    calls.push(`add:${sprintId}:${taskId}`);
    return { moved: true };
  },
  removeTaskFromSprint: async (_em: unknown, _ctx: unknown, sprintId: string, taskId: string) => {
    calls.push(`remove:${sprintId}:${taskId}`);
    return { moved: true };
  },
}));

beforeEach(() => {
  calls.splice(0, calls.length);
});

describe("/projects/[id]/backlog +page.server.ts", () => {
  let disposeScope: (() => void) | undefined;
  beforeAll(() => {
    disposeScope = useApplicationScope((_locals, projectId) => ({
      em: appScope.em,
      ctx: { ...appScope.ctx, projectId: projectId ?? appScope.ctx.projectId },
    }));
  });
  afterAll(() => {
    disposeScope?.();
  });

  test("server route uses the work-management interface instead of direct application imports", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("@work-management/interface/project-backlog");
    expect(source).not.toContain("@work-management/application/sprints");
    expect(source).not.toContain("$lib/server/application-scope");
  });

  test("load returns backlog tasks and sprints", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: "project-1" },
      locals: { orgId: "org-1" },
    } as Parameters<typeof mod.load>[0]);

    expect(result.project.name).toBe("Project");
    expect(result.sprints).toHaveLength(1);
    expect(result.backlogTasks[0]?.title).toBe("Backlog task");
  });

  test("addTask action assigns task to sprint through the service boundary", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.actions.addTask({
      request: form({ sprintId: "sprint-1", taskId: "task-1" }),
      params: { id: "project-1" },
      locals: {},
    } as Parameters<typeof mod.actions.addTask>[0]);

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual(["add:sprint-1:task-1"]);
  });

  test("removeTask action unassigns task from sprint through the service boundary", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.actions.removeTask({
      request: form({ sprintId: "sprint-1", taskId: "task-1" }),
      params: { id: "project-1" },
      locals: {},
    } as Parameters<typeof mod.actions.removeTask>[0]);

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual(["remove:sprint-1:task-1"]);
  });

  test("actions validate required sprint and task ids", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.actions.addTask({
      request: form({ sprintId: "", taskId: "" }),
      params: { id: "project-1" },
      locals: {},
    } as Parameters<typeof mod.actions.addTask>[0]);

    expect(result.status).toBe(400);
    expect(result.data.error).toBe("sprintId and taskId required");
  });
});
