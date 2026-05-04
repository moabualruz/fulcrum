import { describe, expect, mock, test } from "bun:test";

const mockQuery = mock(() => Promise.resolve([]));
const mockClose = mock(() => Promise.resolve());

mock.module("$lib/server/db", () => ({
  openProductDb: () => Promise.resolve({ query: mockQuery, close: mockClose }),
  getDefaultOrgId: () => Promise.resolve("org-1"),
}));

mock.module("$lib/product-queries", () => ({
  listBoardTasks: () =>
    Promise.resolve([
      { id: "t1", title: "In sprint", status: "pending", priority: 2, project_id: "p1", updated_at: "2026-05-01", sprint_id: "sprint-1" },
      { id: "t2", title: "Not in sprint", status: "pending", priority: 1, project_id: "p1", updated_at: "2026-05-01", sprint_id: null },
    ]),
}));

mock.module("$lib/server/tasks", () => ({
  TASK_STATUSES: ["pending", "in_progress", "blocked", "completed", "cancelled"],
  createTaskAction: mock(() => Promise.resolve({ id: "t-new" })),
  moveTaskStatusAction: mock(() => Promise.resolve()),
  updateTaskAction: mock(() => Promise.resolve()),
}));

mock.module("$lib/server/boards.schema", () => ({
  BoardMoveSchema: { type: "object" },
}));

mock.module("$lib/feedback/action-result", () => ({
  actionOk: (msg: string) => ({ ok: true, message: msg }),
  actionFail: (msg: string) => ({ ok: false, message: msg }),
}));

describe("/projects/[id]/sprint/[sprintId] +page.server", () => {
  test("load returns only sprint-scoped tasks", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("FROM projects")) return Promise.resolve([{ id: "p1", name: "Alpha" }]);
      if (sql.includes("FROM sprints")) return Promise.resolve([{
        id: "sprint-1", name: "Sprint 1", goal: "Ship it", start_date: "2026-05-01", end_date: "2026-05-14", status: "active",
      }]);
      return Promise.resolve([]);
    });

    const { load } = await import("./+page.server.ts");
    const result = await load({
      params: { id: "p1", sprintId: "sprint-1" },
      url: new URL("http://localhost/projects/p1/sprint/sprint-1"),
    } as never);

    expect(result.sprint.id).toBe("sprint-1");
    expect(result.sprint.goal).toBe("Ship it");
    expect(result.tasks.every((t: { sprint_id?: string | null }) => t.sprint_id === "sprint-1")).toBe(true);
    expect(result.tasks.find((t: { id: string }) => t.id === "t2")).toBeUndefined();
  });
});
