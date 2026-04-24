import type { Hono } from "hono";
import type { ArtifactService } from "@fulcrum/core";

export function registerArtifactRoutes(app: Hono, artifacts: ArtifactService): void {
  app.get("/api/v1/runs/:runId/artifacts", (c) =>
    c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: artifacts.listForRun(c.req.param("runId")),
      redactionStatus: "not_applicable"
    })
  );

  app.get("/api/v1/artifacts/:artifactId", (c) => {
    const artifact = artifacts.show(c.req.param("artifactId"));
    if (!artifact) {
      return c.json(
        {
          schemaVersion: "1.0",
          status: "error",
          error: {
            code: "NOT_FOUND",
            message: "Artifact not found.",
            redactionStatus: "not_applicable"
          }
        },
        404
      );
    }
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: artifact,
      redactionStatus: artifact.redactionStatus
    });
  });

  app.post("/api/v1/artifacts", async (c) => {
    const body = (await c.req.json()) as {
      type: "log";
      localRef: string;
      summary: string;
      projectId?: string;
      taskId?: string;
      runId?: string;
    };
    const artifact = await artifacts.attach({ ...body, capturedBy: "api.artifacts.attach" });
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: artifact,
      redactionStatus: artifact.redactionStatus
    });
  });
}
