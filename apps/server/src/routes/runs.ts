import type { Hono } from "hono";
import type { RunLifecycleService } from "@fulcrum/core";

export function registerRunRoutes(app: Hono, runs: RunLifecycleService): void {
  app.post("/api/v1/runs", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { taskId?: string; agentId?: string };
    if (!body.taskId || !body.agentId) {
      return c.json(
        { schemaVersion: "1.0", status: "error", error: "taskId and agentId required" },
        400
      );
    }
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: runs.start({ taskId: body.taskId, agentId: body.agentId })
    });
  });

  app.get("/api/v1/runs/:runId", (c) => {
    const run = runs.get(c.req.param("runId"));
    return c.json(
      { schemaVersion: "1.0", status: run ? "ok" : "error", data: run },
      run ? 200 : 404
    );
  });

  app.post("/api/v1/runs/:runId/cancel", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: runs.cancel(c.req.param("runId"), body.reason)
    });
  });

  app.get("/api/v1/runs/:runId/events", (c) =>
    c.json({ schemaVersion: "1.0", status: "ok", data: runs.events(c.req.param("runId")) })
  );
}
