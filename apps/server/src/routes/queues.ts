import type { Hono } from "hono";
import { buildQueueSummary } from "@fulcrum/core";
import type { LocalTaskService, ProjectRegistryService } from "@fulcrum/core";

export function registerQueueRoutes(
  app: Hono,
  projects: ProjectRegistryService,
  tasks: LocalTaskService
): void {
  app.get("/api/v1/queues/review", (c) => {
    const summary = buildQueueSummary(projects.list(), tasks.list());
    return c.json({ schemaVersion: "1.0", status: "ok", data: summary.review });
  });

  app.get("/api/v1/queues/merge", (c) => {
    const summary = buildQueueSummary(projects.list(), tasks.list());
    return c.json({ schemaVersion: "1.0", status: "ok", data: summary.merge });
  });

  app.get("/api/v1/activity", (c) => {
    const summary = buildQueueSummary(projects.list(), tasks.list());
    return c.json({ schemaVersion: "1.0", status: "ok", data: summary });
  });
}
