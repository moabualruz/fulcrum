import type { Hono } from "hono";
import type { RunLifecycleService } from "@fulcrum/core";

export function registerActivityRoutes(app: Hono, runs: RunLifecycleService): void {
  app.get("/api/v1/activity/runs", (c) => {
    const projectId = c.req.query("projectId");
    return c.json({ schemaVersion: "1.0", status: "ok", data: runs.list(projectId) });
  });
}
