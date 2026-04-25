import type { Hono } from "hono";
import type {
  GraphLinkService,
  InvalidationService,
  TraceabilityQueryService
} from "@fulcrum/core";
import type { GraphNodeType } from "@fulcrum/shared";

export function registerGraphRoutes(
  app: Hono,
  graph: GraphLinkService,
  traceability: TraceabilityQueryService,
  rebuildSources: (projectId: string) => Parameters<GraphLinkService["rebuild"]>[1],
  invalidation?: Pick<InvalidationService, "status">
): void {
  app.get("/api/v1/graph/trace", (c) => {
    const type = c.req.query("type") as GraphNodeType | undefined;
    const id = c.req.query("id");
    if (!type || !id) {
      return c.json({ schemaVersion: "1.0", status: "error", error: "type and id required" }, 400);
    }
    const data = traceability.trace({
      type,
      id,
      depth: Number(c.req.query("depth") ?? 2),
      includeStale: c.req.query("includeStale") === "true"
    });
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: invalidation ? { ...data, invalidationStatus: invalidation.status() } : data
    });
  });

  app.post("/api/v1/graph/rebuild", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { projectId?: string };
    if (!body.projectId) {
      return c.json({ schemaVersion: "1.0", status: "error", error: "projectId required" }, 400);
    }
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: graph.rebuild(body.projectId, rebuildSources(body.projectId))
    });
  });

  app.get("/api/v1/graph/links", (c) => {
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: graph.list(c.req.query("projectId") ?? undefined)
    });
  });
}
