import type { Hono } from "hono";
import type { MemoryService } from "@fulcrum/core";

export function registerMemoryRoutes(app: Hono, memory: MemoryService): void {
  app.get("/api/v1/memory/search", async (c) => {
    const projectId = c.req.query("projectId") ?? c.req.query("project");
    const query = c.req.query("query") ?? c.req.query("q");
    if (!projectId || !query) {
      return c.json(
        { schemaVersion: "1.0", status: "error", error: "projectId and query required" },
        400
      );
    }
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: await memory.search({
        projectId,
        query,
        backend: c.req.query("backend") ?? undefined,
        limit: Number(c.req.query("limit") ?? 20)
      })
    });
  });

  app.post("/api/v1/memory/import", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      projectId?: string;
      path?: string;
      backend?: string;
    };
    if (!body.projectId || !body.path) {
      return c.json(
        { schemaVersion: "1.0", status: "error", error: "projectId and path required" },
        400
      );
    }
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: await memory.import({
        projectId: body.projectId,
        path: body.path,
        backend: body.backend
      })
    });
  });

  app.post("/api/v1/memory/drafts", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      projectId?: string;
      title?: string;
      body?: string;
      sourceRefs?: Array<{ type: string; uri: string; label?: string }>;
      linkedTaskIds?: string[];
      linkedRunIds?: string[];
    };
    if (!body.projectId || !body.title || !body.body) {
      return c.json(
        { schemaVersion: "1.0", status: "error", error: "projectId, title, and body required" },
        400
      );
    }
    const data = memory.draft({
      projectId: body.projectId,
      title: body.title,
      body: body.body,
      sourceRefs: body.sourceRefs ?? [],
      linkedTaskIds: body.linkedTaskIds,
      linkedRunIds: body.linkedRunIds
    });
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data,
      policyDecisionIds: [data.policyDecision.policyDecisionId]
    });
  });

  app.post("/api/v1/memory/:memoryId/approve", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { policyDecisionId?: string };
    const data = memory.approve(c.req.param("memoryId"), {
      policyDecisionId: body.policyDecisionId
    });
    return c.json(
      { schemaVersion: "1.0", status: data.entry ? "ok" : "error", data },
      data.entry ? 200 : 404
    );
  });

  app.post("/api/v1/memory/:memoryId/stale", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: memory.markStale(c.req.param("memoryId"), body.reason)
    });
  });

  app.get("/api/v1/memory/export", (c) => {
    const projectId = c.req.query("projectId") ?? c.req.query("project");
    if (!projectId) {
      return c.json({ schemaVersion: "1.0", status: "error", error: "projectId required" }, 400);
    }
    const data = memory.export(projectId);
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data,
      redactionStatus: data.redactionStatus
    });
  });
}
