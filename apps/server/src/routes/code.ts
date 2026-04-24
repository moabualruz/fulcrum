import type { Hono } from "hono";
import type { CodeEvidenceService } from "@fulcrum/core";

export function registerCodeRoutes(app: Hono, code: CodeEvidenceService): void {
  app.get("/api/v1/code/search", async (c) => {
    const projectId = c.req.query("projectId") ?? c.req.query("project");
    const query = c.req.query("query") ?? c.req.query("q");
    if (!projectId || !query) {
      return c.json(
        { schemaVersion: "1.0", status: "error", error: "projectId and query required" },
        400
      );
    }
    const data = await code.search({
      projectId,
      query,
      limit: Number(c.req.query("limit") ?? 50),
      includeSemantic: c.req.query("semantic") === "true"
    });
    return c.json({ schemaVersion: "1.0", status: "ok", data });
  });

  app.post("/api/v1/code/stale-cleanup", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { projectId?: string };
    if (!body.projectId) {
      return c.json({ schemaVersion: "1.0", status: "error", error: "projectId required" }, 400);
    }
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: code.cleanupStale(body.projectId)
    });
  });
}
