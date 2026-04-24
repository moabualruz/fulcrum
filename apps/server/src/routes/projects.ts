import type { Hono } from "hono";
import type { ProjectRegistryService } from "@fulcrum/core";

export function registerProjectRoutes(app: Hono, projects: ProjectRegistryService): void {
  app.get("/api/v1/projects", (c) =>
    c.json({ schemaVersion: "1.0", status: "ok", data: projects.overview() })
  );

  app.post("/api/v1/projects", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { rootPath?: string; name?: string };
    if (!body.rootPath) {
      return c.json({ schemaVersion: "1.0", status: "error", error: "rootPath required" }, 400);
    }
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: projects.register({ rootPath: body.rootPath, name: body.name })
    });
  });

  app.get("/api/v1/projects/:projectId", (c) => {
    const project = projects.get(c.req.param("projectId"));
    return c.json(
      { schemaVersion: "1.0", status: project ? "ok" : "error", data: project },
      project ? 200 : 404
    );
  });

  app.get("/api/v1/projects/:projectId/health", (c) => {
    const project = projects.get(c.req.param("projectId"));
    return c.json(
      {
        schemaVersion: "1.0",
        status: project ? "ok" : "error",
        data: project
          ? {
              projectId: project.projectId,
              healthState: project.healthState,
              privacyMode: project.privacyMode
            }
          : undefined
      },
      project ? 200 : 404
    );
  });
}
