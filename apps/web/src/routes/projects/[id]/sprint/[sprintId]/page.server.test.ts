import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: string[] = [];
const detail = {
  project: { id: "project-1", name: "Project" },
  sprint: {
    id: "sprint-1",
    name: "Sprint 1",
    goal: "Ship it",
    start_date: "2026-05-01",
    end_date: "2026-05-14",
    status: "active",
  },
  tasks: [
    {
      id: "task-1",
      title: "In sprint",
      status: "pending",
      priority: 2,
      project_id: "project-1",
      sprint_id: "sprint-1",
      updated_at: "2026-05-01T00:00:00.000Z",
    },
  ],
};

// The detail route reads and mutates sprint tasks through the sprint public
// API; this seam is mocked so the test never opens a database.
mock.module("$lib/server/sprint-api", () => ({
  createSprintApiForEvent: () => ({
    sprints: {
      loadProjectSprintDetail: async (input: { id: string; projectId: string }) => {
        calls.push(`detail:${input.id}:${input.projectId}`);
        return detail;
      },
      createProjectSprintTask: async (input: { id: string; title: string; status?: string | null }) => {
        calls.push(`create:${input.title}:${input.status}:${input.id}`);
        return { id: "task-new" };
      },
      updateProjectSprintTask: async (input: { taskId: string; status?: string | null }) => {
        calls.push(`move:${input.taskId}:${input.status}`);
        return { ok: true };
      },
      updateProjectSprintGoal: async (input: { id: string; goal: string }) => {
        calls.push(`goal:${input.id}:${input.goal}`);
        return { ok: true };
      },
      completeProjectSprint: async (input: { id: string }) => {
        calls.push(`close:${input.id}`);
        return { id: input.id, metrics: { velocity: 0, completed_tasks: 0 } };
      },
    },
  }),
}));

beforeEach(() => {
  calls.splice(0, calls.length);
});

function event(method: "GET" | "POST", data: Record<string, string> = {}) {
  const url = new URL("http://localhost/projects/project-1/sprint/sprint-1");
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return {
    url,
    params: { id: "project-1", sprintId: "sprint-1" },
    locals: { orgId: "org-1", userId: "user-1" },
    fetch: globalThis.fetch,
    request: new Request(url, method === "POST" ? { method, body: fd } : { method }),
  } as unknown as Parameters<typeof import("./+page.server.ts").load>[0];
}

describe("/projects/[id]/sprint/[sprintId] +page.server", () => {
  test("server route uses the sprint public API instead of direct application scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("$lib/server/sprint-api");
    expect(source).not.toContain("project-request-scope");
    expect(source).not.toContain("@work-management/interface/project-sprints");
    expect(source).not.toContain("EntityManager");
  });

  test("load returns sprint-scoped tasks", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(event("GET"));

    expect(result.sprint.id).toBe("sprint-1");
    expect(result.sprint.goal).toBe("Ship it");
    expect(result.tasks.every((task: { sprint_id?: string }) => task.sprint_id === "sprint-1")).toBe(true);
    expect(calls).toEqual(["detail:sprint-1:project-1"]);
  });

  test("create action creates a sprint task through the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.actions.create(event("POST", { title: "New task", status: "pending" }));

    expect(result).toEqual({ ok: true, message: "Task created" });
    expect(calls).toEqual(["create:New task:pending:sprint-1"]);
  });

  test("move action uses the parsed target status", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.actions.move(event("POST", { id: "task-1", from: "pending", to: "completed" }));

    expect(result).toEqual({ ok: true, message: "Task moved" });
    expect(calls).toEqual(["move:task-1:completed"]);
  });

  test("goal update and close sprint actions use the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const goal = await mod.actions.updateGoal(event("POST", { goal: "New goal" }));
    const close = await mod.actions.closeSprint(event("POST"));

    expect(goal).toEqual({ ok: true, message: "Goal updated" });
    expect(close).toEqual({ ok: true, message: "Sprint closed" });
    expect(calls).toEqual(["goal:sprint-1:New goal", "close:sprint-1"]);
  });
});
