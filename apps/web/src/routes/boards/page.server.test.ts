import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: string[] = [];
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

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/boards", { method: "POST", body: fd });
}

mock.module("$lib/server/application-scope", () => ({
  requestAppScope: async (_locals: unknown, projectId: string | null) => ({
    em: { kind: "mock-em" },
    ctx: { orgId: "org-1", userId: "user-1", projectId },
  }),
}));

mock.module("@work-management/interface/work-item-detail.ts", () => ({
  listBoardWorkItems: async (_em: unknown, ctx: { projectId?: string | null }) => {
    calls.push(`list:${ctx.projectId ?? ""}`);
    return boardTasks;
  },
}));

mock.module("@work-management/interface/work-item-actions.ts", () => ({
  TASK_STATUSES: ["pending", "in_progress", "blocked", "completed", "cancelled"],
  createTaskAction: async () => ({ id: "task-new" }),
  updateTaskAction: async () => ({ ok: true }),
  deleteTaskAction: async () => ({ ok: true }),
  moveTaskStatusAction: async () => ({ ok: true }),
  createWorkItem: async (_em: unknown, _ctx: unknown, input: { title: string; status?: string | null }) => {
    calls.push(`create:${input.title}:${input.status ?? ""}`);
    return { id: "task-new" };
  },
  updateWorkItem: async (
    _em: unknown,
    _ctx: unknown,
    id: string,
    input: { status?: string | null; expectedStatus?: string | null },
  ) => {
    calls.push(`update:${id}:${input.expectedStatus ?? ""}:${input.status ?? ""}`);
    if (input.expectedStatus === "blocked") throw new Error("status conflict: expected blocked, got pending");
    return { id };
  },
  deleteWorkItem: async (_em: unknown, _ctx: unknown, id: string) => {
    calls.push(`delete:${id}`);
    return { id };
  },
  bulkUpdateWorkItems: async (_em: unknown, _ctx: unknown, ids: string[], patch: { status?: string | null }) => {
    calls.push(`bulk-update:${ids.join("|")}:${patch.status ?? ""}`);
    return { updated: ids.length };
  },
  bulkDeleteWorkItems: async (_em: unknown, _ctx: unknown, ids: string[]) => {
    calls.push(`bulk-delete:${ids.join("|")}`);
    return { deleted: ids.length };
  },
}));

beforeEach(() => {
  calls.splice(0, calls.length);
});

describe("/boards +page.server.ts", () => {
  test("server route uses work-management interfaces instead of direct application imports", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("@work-management/interface/work-item-actions");
    expect(source).toContain("@work-management/interface/work-item-detail");
    expect(source).toContain("$lib/server/request-service-scope");
    expect(source).not.toContain("@work-management/application/tasks");
    expect(source).not.toContain("$lib/server/application-scope");
  });

  test("load returns board rows through the service boundary", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      url: new URL("http://localhost/boards?project=project-1"),
      locals: {},
      parent: async () => ({ activeProjectId: null }),
    } as Parameters<typeof mod.load>[0]);

    expect(result.project).toBe("project-1");
    const payload = await result.streamed.data;
    expect(payload.tasks).toEqual(boardTasks);
    expect(calls).toEqual(["list:project-1"]);
  });

  test("create, update, delete, and bulk actions call the service boundary", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const locals = { activeProjectId: "project-1" };

    await mod.actions.create({
      request: form({ title: "New task", status: "pending" }),
      locals,
    } as Parameters<typeof mod.actions.create>[0]);
    await mod.actions.update({
      request: form({ id: "task-1", title: "Renamed", status: "in_progress", priority: "2" }),
      locals,
    } as Parameters<typeof mod.actions.update>[0]);
    await mod.actions.delete({
      request: form({ id: "task-1" }),
      locals,
    } as Parameters<typeof mod.actions.delete>[0]);
    const bulkStatus = await mod.actions.bulkStatus({
      request: form({ ids: "task-1,task-2", status: "blocked" }),
      locals,
    } as Parameters<typeof mod.actions.bulkStatus>[0]);
    const bulkDelete = await mod.actions.bulkDelete({
      request: form({ ids: "task-1,task-2" }),
      locals,
    } as Parameters<typeof mod.actions.bulkDelete>[0]);

    expect(bulkStatus).toEqual({ ok: true, message: "2 task(s) updated" });
    expect(bulkDelete).toEqual({ ok: true, message: "2 task(s) deleted" });
    expect(calls).toEqual([
      "create:New task:pending",
      "update:task-1::in_progress",
      "delete:task-1",
      "bulk-update:task-1|task-2:blocked",
      "bulk-delete:task-1|task-2",
    ]);
  });

  test("move preserves optimistic status conflict handling", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const ok = await mod.actions.move({
      request: form({ id: "task-1", from: "pending", to: "in_progress" }),
      locals: { activeProjectId: "project-1" },
    } as Parameters<typeof mod.actions.move>[0]);
    const conflict = await mod.actions.move({
      request: form({ id: "task-1", from: "blocked", to: "completed" }),
      locals: { activeProjectId: "project-1" },
    } as Parameters<typeof mod.actions.move>[0]);

    expect(ok).toEqual({ ok: true, message: "Task moved" });
    expect((conflict as { status?: number }).status).toBe(409);
    expect(calls).toEqual([
      "update:task-1:pending:in_progress",
      "update:task-1:blocked:completed",
    ]);
  });
});
