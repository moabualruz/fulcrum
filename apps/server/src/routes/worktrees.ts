import type { Hono } from "hono";
import type { WorktreeAllocationService, WorktreeStatusService } from "@fulcrum/core";

export function registerWorktreeRoutes(
  app: Hono,
  allocator: WorktreeAllocationService,
  status: WorktreeStatusService
): void {
  app.post("/api/v1/worktrees", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      taskId?: string;
      branch?: string;
      path?: string;
    };
    if (!body.taskId) {
      return c.json({ schemaVersion: "1.0", status: "error", error: "taskId required" }, 400);
    }
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: allocator.allocate({ taskId: body.taskId, branch: body.branch, path: body.path })
    });
  });

  app.get("/api/v1/worktrees/:worktreeId", (c) =>
    c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: status.inspect(c.req.param("worktreeId"))
    })
  );

  app.get("/api/v1/worktrees/:worktreeId/diff", (c) =>
    c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: status.diff(c.req.param("worktreeId"))
    })
  );

  app.post("/api/v1/worktrees/:worktreeId/cleanup-preview", (c) =>
    c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: status.cleanupPreview(c.req.param("worktreeId"))
    })
  );

  app.post("/api/v1/worktrees/:worktreeId/cleanup", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { approved?: boolean };
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: status.cleanup(c.req.param("worktreeId"), { approved: Boolean(body.approved) })
    });
  });
}
