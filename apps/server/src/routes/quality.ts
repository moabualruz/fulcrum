import type { Hono } from "hono";
import type { QualityGateRunner, QualityReadinessEvaluator } from "@fulcrum/core";

export function registerQualityRoutes(
  app: Hono,
  runner: QualityGateRunner,
  readiness: QualityReadinessEvaluator
): void {
  app.get("/api/v1/quality/gates", (c) => {
    const projectId = c.req.query("projectId");
    if (!projectId) {
      return c.json({ schemaVersion: "1.0", status: "error", error: "projectId required" }, 400);
    }
    return c.json({ schemaVersion: "1.0", status: "ok", data: runner.list(projectId) });
  });

  app.post("/api/v1/quality/gates", async (c) => {
    const body = (await c.req.json()) as {
      gateId: string;
      projectId: string;
      name: string;
      command: string;
      required?: boolean;
      timeoutMs?: number;
    };
    return c.json(
      {
        schemaVersion: "1.0",
        status: "ok",
        data: runner.define({ ...body, required: body.required ?? false })
      },
      201
    );
  });

  app.post("/api/v1/quality/run", async (c) => {
    const body = (await c.req.json()) as {
      gateId: string;
      cwd: string;
      projectId?: string;
      taskId?: string;
      runId?: string;
      artifactRoot?: string;
      skip?: boolean;
    };
    const result = await runner.run(body);
    return c.json({ schemaVersion: "1.0", status: "ok", data: result });
  });

  app.get("/api/v1/quality/results", (c) => {
    const projectId = c.req.query("projectId");
    if (!projectId) {
      return c.json({ schemaVersion: "1.0", status: "error", error: "projectId required" }, 400);
    }
    const data = runner.results({
      projectId,
      runId: c.req.query("runId"),
      taskId: c.req.query("taskId")
    });
    return c.json({ schemaVersion: "1.0", status: "ok", data });
  });

  app.post("/api/v1/quality/readiness", async (c) => {
    const body = (await c.req.json()) as {
      projectId: string;
      runId?: string;
      taskId?: string;
      exceptions?: Record<string, string>;
    };
    return c.json({ schemaVersion: "1.0", status: "ok", data: readiness.evaluate(body) });
  });
}
