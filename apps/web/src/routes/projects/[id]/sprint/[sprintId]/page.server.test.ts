import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

import { applicationScopeMock } from "$lib/test/application-scope-mock";

const calls: string[] = [];

// Active only while this suite runs. `mock.module` is process-wide, so the
// seam falls through to the real scope resolver when a foreign suite is
// exercising the module.
let suiteActive = false;
const pageData = {
  project: { id: "project-1", name: "Project" },
  sprint: {
    id: "sprint-1",
    name: "Sprint 1",
    goal: "Ship it",
    start_date: "2026-05-01",
    end_date: "2026-05-14",
    status: "active",
  },
  tasks: [{ id: "task-1", title: "In sprint", status: "pending", priority: 2, project_id: "project-1", sprint_id: "sprint-1", updated_at: "2026-05-01T00:00:00.000Z" }],
};

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/projects/project-1/sprint/sprint-1", { method: "POST", body: fd });
}

// `applicationScopeMock` keeps a complete export set (so sibling suites that
// import `__setApplicationScopeForTest` still resolve it). The `project-sprints`
// interface is mocked too, so the `em` value is never actually queried here.
mock.module("$lib/server/application-scope", () =>
  applicationScopeMock((_locals, projectId) =>
    suiteActive
      ? { em: { kind: "mock-em" }, ctx: { orgId: "org-1", userId: "user-1", projectId: projectId ?? null } }
      : null,
  ),
);

mock.module("@work-management/interface/project-sprints.ts", () => ({
  loadProjectSprintDetail: async () => pageData,
  createProjectTask: async (_em: unknown, _ctx: unknown, input: { title: string; status?: string | null; sprintId?: string | null }) => {
    calls.push(`create:${input.title}:${input.status}:${input.sprintId}`);
    return { id: "task-new" };
  },
  updateProjectTask: async (_em: unknown, _ctx: unknown, taskId: string, patch: { status?: string | null }) => {
    calls.push(`move:${taskId}:${patch.status}`);
    return { ok: true };
  },
  updateSprintGoal: async (_em: unknown, _ctx: unknown, sprintId: string, goal: string) => {
    calls.push(`goal:${sprintId}:${goal}`);
    return { ok: true };
  },
  completeProjectSprint: async (_em: unknown, _ctx: unknown, sprintId: string) => {
    calls.push(`close:${sprintId}`);
    return { id: sprintId, metrics: { velocity: 0, completed_tasks: 0 } };
  },
}));

beforeAll(() => {
  suiteActive = true;
});

afterAll(() => {
  suiteActive = false;
});

beforeEach(() => {
  calls.splice(0, calls.length);
});

describe("/projects/[id]/sprint/[sprintId] +page.server", () => {
  test("server route uses the work-management interface instead of direct application imports", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("@work-management/interface/project-sprints");
    expect(source).not.toContain("@work-management/application/sprints");
    expect(source).not.toContain("@work-management/application/projects");
    expect(source).not.toContain("$lib/server/application-scope");
  });

  test("load returns sprint-scoped tasks", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: "project-1", sprintId: "sprint-1" },
      locals: {},
    } as Parameters<typeof mod.load>[0]);

    expect(result.sprint.id).toBe("sprint-1");
    expect(result.sprint.goal).toBe("Ship it");
    expect(result.tasks.every((task) => task.sprint_id === "sprint-1")).toBe(true);
  });

  test("create action creates a sprint task through the service boundary", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.actions.create({
      request: form({ title: "New task", status: "pending" }),
      params: { id: "project-1", sprintId: "sprint-1" },
      locals: {},
    } as Parameters<typeof mod.actions.create>[0]);

    expect(result).toEqual({ ok: true, message: "Task created" });
    expect(calls).toEqual(["create:New task:pending:sprint-1"]);
  });

  test("move action uses the parsed target status", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.actions.move({
      request: form({ id: "task-1", from: "pending", to: "completed" }),
      params: { id: "project-1", sprintId: "sprint-1" },
      locals: {},
    } as Parameters<typeof mod.actions.move>[0]);

    expect(result).toEqual({ ok: true, message: "Task moved" });
    expect(calls).toEqual(["move:task-1:completed"]);
  });

  test("goal update and close sprint actions use the service boundary", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const goal = await mod.actions.updateGoal({
      request: form({ goal: "New goal" }),
      params: { id: "project-1", sprintId: "sprint-1" },
      locals: {},
    } as Parameters<typeof mod.actions.updateGoal>[0]);
    const close = await mod.actions.closeSprint({
      params: { id: "project-1", sprintId: "sprint-1" },
      locals: {},
    } as Parameters<typeof mod.actions.closeSprint>[0]);

    expect(goal).toEqual({ ok: true, message: "Goal updated" });
    expect(close).toEqual({ ok: true, message: "Sprint closed" });
    expect(calls).toEqual(["goal:sprint-1:New goal", "close:sprint-1"]);
  });
});
