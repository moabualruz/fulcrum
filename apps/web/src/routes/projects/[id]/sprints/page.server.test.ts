import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

import { applicationScopeMock } from "$lib/test/application-scope-mock";

const calls: string[] = [];
const pageData = {
  sprints: [{ id: "sprint-1", name: "Sprint 1", status: "planning", capacity_points: 20 }],
  velocity: [],
};

// Active only while this suite runs. `mock.module` is process-wide, so the
// seam falls through to the real scope resolver when a foreign suite is
// exercising the module.
let suiteActive = false;

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/projects/project-1/sprints", { method: "POST", body: fd });
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
  loadProjectSprints: async () => pageData,
  loadProjectSprintDetail: async () => ({
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
  }),
  createProjectSprint: async (_em: unknown, _ctx: unknown, input: { name: string; capacity?: number | null }) => {
    calls.push(`create:${input.name}:${input.capacity ?? ""}`);
    return { id: "sprint-new" };
  },
  createProjectTask: async (_em: unknown, _ctx: unknown, input: { title: string; status?: string | null; sprintId?: string | null }) => {
    calls.push(`create-task:${input.title}:${input.status}:${input.sprintId}`);
    return { id: "task-new" };
  },
  updateProjectTask: async (_em: unknown, _ctx: unknown, taskId: string, patch: { status?: string | null }) => {
    calls.push(`move:${taskId}:${patch.status}`);
    return { ok: true };
  },
  startProjectSprint: async (_em: unknown, _ctx: unknown, sprintId: string) => {
    calls.push(`start:${sprintId}`);
    return { ok: true };
  },
  completeProjectSprint: async (_em: unknown, _ctx: unknown, sprintId: string) => {
    calls.push(`complete:${sprintId}`);
    return { id: sprintId, metrics: { velocity: 3, completed_tasks: 2 } };
  },
  updateSprintGoal: async (_em: unknown, _ctx: unknown, sprintId: string, goal: string) => {
    calls.push(`goal:${sprintId}:${goal}`);
    return { ok: true };
  },
}));

mock.module("@work-management/interface/project-lifecycle.ts", () => ({
  loadProjectOverview: async (_em: unknown, _ctx: unknown, projectId: string) => ({ id: projectId, name: "Project" }),
}));

beforeAll(() => {
  suiteActive = true;
});

afterAll(() => {
  suiteActive = false;
});

beforeEach(() => {
  calls.splice(0, calls.length);
  delete process.env["FULCRUM_FEATURES"];
});

describe("/projects/[id]/sprints +page.server.ts", () => {
  test("server route uses the work-management interface instead of direct application imports", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("@work-management/interface/project-sprints");
    expect(source).not.toContain("@work-management/application/sprints");
    expect(source).not.toContain("$lib/server/application-scope");
  });

  test("load returns sprints and velocity data", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: "project-1" },
      locals: {},
    } as Parameters<typeof mod.load>[0]);
    expect(result.projectId).toBe("project-1");
    const data = await result.streamed.data;
    expect(data.sprints[0]?.name).toBe("Sprint 1");
    expect(data.velocity).toEqual([]);
  });

  test("createSprint action creates a new sprint through the service boundary", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.actions.createSprint({
      request: form({ name: "Sprint 2", capacity: "30" }),
      params: { id: "project-1" },
      locals: {},
    } as Parameters<typeof mod.actions.createSprint>[0]);
    expect(result).toEqual({ ok: true, message: "Sprint created" });
    expect(calls).toEqual(["create:Sprint 2:30"]);
  });

  test("startSprint and completeSprint actions call the service boundary", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const start = await mod.actions.startSprint({
      request: form({ id: "sprint-1" }),
      params: { id: "project-1" },
      locals: {},
    } as Parameters<typeof mod.actions.startSprint>[0]);
    const complete = await mod.actions.completeSprint({
      request: form({ id: "sprint-1" }),
      params: { id: "project-1" },
      locals: {},
    } as Parameters<typeof mod.actions.completeSprint>[0]);

    expect(start).toEqual({ ok: true, message: "Sprint started" });
    expect(complete).toEqual({ ok: true, message: "Sprint completed" });
    expect(calls).toEqual(["start:sprint-1", "complete:sprint-1"]);
  });
});
