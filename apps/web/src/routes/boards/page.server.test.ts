import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: Array<{ method: string; input: Record<string, unknown> }> = [];
const boardTasks = [
  {
    id: "task-1",
    title: "Plan",
    status: "pending",
    priority: 0,
    project_id: "project-1",
    updated_at: "2026-05-15T00:00:00.000Z",
  },
];

mock.module("$lib/server/workspace-board-api", () => ({
  createWorkspaceBoardApiForEvent: () => ({
    tasks: {
      board: {
        list: async (input: Record<string, unknown>) => {
          calls.push({ method: "list", input });
          return boardTasks;
        },
        create: async (input: Record<string, unknown>) => {
          calls.push({ method: "create", input });
          return { id: "task-new" };
        },
        update: async (input: Record<string, unknown>) => {
          calls.push({ method: "update", input });
          if (input.expectedStatus === "blocked") throw new Error("status conflict: expected blocked, got pending");
          return { id: input.id };
        },
        delete: async (input: Record<string, unknown>) => {
          calls.push({ method: "delete", input });
          return { id: input.id };
        },
        bulkStatus: async (input: Record<string, unknown>) => {
          calls.push({ method: "bulkStatus", input });
          return { updated: (input.ids as string[]).length };
        },
        bulkDelete: async (input: Record<string, unknown>) => {
          calls.push({ method: "bulkDelete", input });
          return { deleted: (input.ids as string[]).length };
        },
        move: async (input: Record<string, unknown>) => {
          calls.push({ method: "move", input });
          if (input.expectedStatus === "blocked") throw new Error("status conflict: expected blocked, got pending");
          return { id: input.id };
        },
      },
    },
  }),
}));

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/boards", { method: "POST", body: fd });
}

function event(request: Request = form({}), locals: Record<string, unknown> = { activeProjectId: "project-1" }) {
  return {
    url: new URL("http://localhost/boards?project=project-1"),
    request,
    locals,
    fetch,
    parent: async () => ({ activeProjectId: null }),
  };
}

beforeEach(() => {
  calls.splice(0, calls.length);
});

describe("/boards +page.server.ts", () => {
  test("load returns board rows through the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(event() as Parameters<typeof mod.load>[0]);

    expect(result.project).toBe("project-1");
    const payload = await result.streamed.data;
    expect(payload.tasks).toEqual(boardTasks);
    expect(calls).toEqual([{ method: "list", input: { projectId: "project-1" } }]);
  });

  test("create, update, delete, and bulk actions call the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const locals = { activeProjectId: "project-1" };

    await mod.actions.create({
      ...event(form({ title: "New task", status: "pending" }), locals),
    } as Parameters<typeof mod.actions.create>[0]);
    await mod.actions.update({
      ...event(form({ id: "task-1", title: "Renamed", status: "in_progress", priority: "2" }), locals),
    } as Parameters<typeof mod.actions.update>[0]);
    await mod.actions.delete({
      ...event(form({ id: "task-1" }), locals),
    } as Parameters<typeof mod.actions.delete>[0]);
    const bulkStatus = await mod.actions.bulkStatus({
      ...event(form({ ids: "task-1,task-2", status: "blocked" }), locals),
    } as Parameters<typeof mod.actions.bulkStatus>[0]);
    const bulkDelete = await mod.actions.bulkDelete({
      ...event(form({ ids: "task-1,task-2" }), locals),
    } as Parameters<typeof mod.actions.bulkDelete>[0]);

    expect(bulkStatus).toEqual({ ok: true, message: "2 task(s) updated" });
    expect(bulkDelete).toEqual({ ok: true, message: "2 task(s) deleted" });
    expect(calls).toEqual([
      { method: "create", input: { title: "New task", status: "pending", projectId: null } },
      { method: "update", input: { id: "task-1", title: "Renamed", status: "in_progress", priority: 2, projectId: "project-1" } },
      { method: "delete", input: { id: "task-1", projectId: "project-1" } },
      { method: "bulkStatus", input: { ids: ["task-1", "task-2"], status: "blocked", projectId: "project-1" } },
      { method: "bulkDelete", input: { ids: ["task-1", "task-2"], projectId: "project-1" } },
    ]);
  });

  test("move preserves optimistic status conflict handling", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const ok = await mod.actions.move({
      ...event(form({ id: "task-1", from: "pending", to: "in_progress" })),
    } as Parameters<typeof mod.actions.move>[0]);
    const conflict = await mod.actions.move({
      ...event(form({ id: "task-1", from: "blocked", to: "completed" })),
    } as Parameters<typeof mod.actions.move>[0]);

    expect(ok).toEqual({ ok: true, message: "Task moved" });
    expect((conflict as { status?: number }).status).toBe(409);
    expect(calls).toEqual([
      { method: "move", input: { id: "task-1", expectedStatus: "pending", status: "in_progress", projectId: "project-1" } },
      { method: "move", input: { id: "task-1", expectedStatus: "blocked", status: "completed", projectId: "project-1" } },
    ]);
  });
});
