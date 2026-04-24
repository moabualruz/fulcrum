import type { Hono } from "hono";
import type { LocalTaskService } from "@fulcrum/core";
import type { Task } from "@fulcrum/shared";

export function registerTaskRoutes(app: Hono, tasks: LocalTaskService): void {
  app.get("/api/v1/tasks", (c) => {
    const projectId = c.req.query("projectId");
    return c.json({ schemaVersion: "1.0", status: "ok", data: tasks.list(projectId) });
  });

  app.post("/api/v1/tasks", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      projectId?: string;
      title?: string;
      description?: string;
      priority?: Task["priority"];
      labels?: string[];
    };
    if (!body.projectId || !body.title) {
      return c.json(
        { schemaVersion: "1.0", status: "error", error: "projectId and title required" },
        400
      );
    }
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: tasks.create({
        projectId: body.projectId,
        title: body.title,
        description: body.description,
        priority: body.priority,
        labels: body.labels
      })
    });
  });

  app.get("/api/v1/tasks/:taskId", (c) => {
    const task = tasks.get(c.req.param("taskId"));
    return c.json(
      { schemaVersion: "1.0", status: task ? "ok" : "error", data: task },
      task ? 200 : 404
    );
  });

  app.post("/api/v1/tasks/:taskId/transition", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { status?: Task["status"] };
    if (!body.status) {
      return c.json({ schemaVersion: "1.0", status: "error", error: "status required" }, 400);
    }
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: tasks.transition(c.req.param("taskId"), body.status)
    });
  });
}
