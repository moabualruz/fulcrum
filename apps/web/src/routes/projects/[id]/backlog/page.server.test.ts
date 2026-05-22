import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: Array<{ method: string; input: unknown }> = [];
let backlogPayload: unknown = {
  project: { id: "project-1", name: "Project" },
  sprints: [{ id: "sprint-1", name: "Sprint 1", status: "active", capacity_points: 20 }],
  backlogTasks: [
    { id: "task-1", title: "Backlog task", status: "pending", priority: 5, estimate_points: null, sprint_id: null },
  ],
};
let backlogThrows = false;

// The route is a pure invocation layer over the project public API web client;
// mock the `*ForEvent` seam so the test exercises route logic without a DB.
mock.module("$lib/server/project-api", () => ({
  loadProjectBacklogForEvent: async (_event: unknown, projectId: string) => {
    calls.push({ method: "loadProjectBacklog", input: projectId });
    if (backlogThrows) throw new Error("not found");
    return backlogPayload;
  },
  addBacklogTaskToSprintForEvent: async (_event: unknown, input: unknown) => {
    calls.push({ method: "addBacklogTaskToSprint", input });
  },
  removeBacklogTaskFromSprintForEvent: async (_event: unknown, input: unknown) => {
    calls.push({ method: "removeBacklogTaskFromSprint", input });
  },
}));

beforeEach(() => {
  calls.splice(0, calls.length);
  backlogThrows = false;
});

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/projects/project-1/backlog", { method: "POST", body: fd });
}

describe("/projects/[id]/backlog +page.server.ts", () => {
  test("server route uses the project public API web client, not in-process project scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("$lib/server/project-api");
    expect(source).not.toContain("project-request-scope");
    expect(source).not.toContain("@work-management/interface/project-backlog");
  });

  test("load returns backlog tasks and sprints", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: "project-1" },
      locals: {},
    } as Parameters<typeof mod.load>[0]);

    expect(result.project.name).toBe("Project");
    expect(result.sprints).toHaveLength(1);
    expect(result.backlogTasks[0]?.title).toBe("Backlog task");
    expect(calls).toEqual([{ method: "loadProjectBacklog", input: "project-1" }]);
  });

  test("load returns 404 when the project public API rejects", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    backlogThrows = true;
    await expect(mod.load({
      params: { id: "missing" },
      locals: {},
    } as Parameters<typeof mod.load>[0])).rejects.toMatchObject({ status: 404 });
  });

  test("addTask action assigns task to sprint through the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.actions.addTask({
      request: form({ sprintId: "sprint-1", taskId: "task-1" }),
      params: { id: "project-1" },
      locals: {},
    } as Parameters<typeof mod.actions.addTask>[0]);

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([
      { method: "addBacklogTaskToSprint", input: { projectId: "project-1", sprintId: "sprint-1", taskId: "task-1" } },
    ]);
  });

  test("removeTask action unassigns task from sprint through the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.actions.removeTask({
      request: form({ sprintId: "sprint-1", taskId: "task-1" }),
      params: { id: "project-1" },
      locals: {},
    } as Parameters<typeof mod.actions.removeTask>[0]);

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([
      { method: "removeBacklogTaskFromSprint", input: { projectId: "project-1", sprintId: "sprint-1", taskId: "task-1" } },
    ]);
  });

  test("actions validate required sprint and task ids", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    const result = await mod.actions.addTask({
      request: form({ sprintId: "", taskId: "" }),
      params: { id: "project-1" },
      locals: {},
    } as Parameters<typeof mod.actions.addTask>[0]);

    expect(result.status).toBe(400);
    expect(result.data.error).toBe("sprintId and taskId required");
    expect(calls).toEqual([]);
  });
});
