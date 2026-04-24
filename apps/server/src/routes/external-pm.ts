import type { Hono } from "hono";
import type { ExternalPmService } from "@fulcrum/core";
import { externalPmHealth } from "@fulcrum/core";

export function registerExternalPmRoutes(app: Hono, externalPm: ExternalPmService): void {
  app.get("/api/v1/external-pm/mirrors", (c) => {
    const projectId = c.req.query("projectId");
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: externalPm.syncStatus(projectId)
    });
  });

  app.get("/api/v1/external-pm/health", async (c) =>
    c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: await externalPmHealth(externalPm.adapterHealthPort())
    })
  );

  app.post("/api/v1/external-pm/import", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { projectId?: string };
    if (!body.projectId) {
      return c.json({ schemaVersion: "1.0", status: "error", error: "projectId required" }, 400);
    }
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: await externalPm.importWork({ projectId: body.projectId })
    });
  });

  app.post("/api/v1/external-pm/sync", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { projectId?: string };
    if (!body.projectId) {
      return c.json({ schemaVersion: "1.0", status: "error", error: "projectId required" }, 400);
    }
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: await externalPm.importWork({ projectId: body.projectId })
    });
  });

  app.post("/api/v1/external-pm/link-task", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { mirrorId?: string; taskId?: string };
    if (!body.mirrorId || !body.taskId) {
      return c.json(
        { schemaVersion: "1.0", status: "error", error: "mirrorId and taskId required" },
        400
      );
    }
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: externalPm.linkTask({ mirrorId: body.mirrorId, taskId: body.taskId })
    });
  });

  app.post("/api/v1/external-pm/writeback-preview", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      mirrorId?: string;
      externalId?: string;
      comment?: string;
      status?: string;
      localOnly?: boolean;
    };
    if (!body.externalId) {
      return c.json({ schemaVersion: "1.0", status: "error", error: "externalId required" }, 400);
    }
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: await externalPm.previewWriteback({
        mirrorId: body.mirrorId,
        externalId: body.externalId,
        comment: body.comment,
        status: body.status,
        localOnly: body.localOnly
      })
    });
  });

  app.post("/api/v1/external-pm/writeback", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      mirrorId?: string;
      decision?: "approve" | "deny" | "postpone";
      policyDecisionId?: string;
      comment?: string;
      status?: string;
    };
    if (!body.mirrorId || !body.decision) {
      return c.json(
        { schemaVersion: "1.0", status: "error", error: "mirrorId and decision required" },
        400
      );
    }
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: await externalPm.decideWriteback({
        mirrorId: body.mirrorId,
        decision: body.decision,
        policyDecisionId: body.policyDecisionId,
        comment: body.comment,
        status: body.status
      })
    });
  });

  app.post("/api/v1/external-pm/disable", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: await externalPm.disable(body.reason ?? "Operator disabled external PM adapter")
    });
  });
}
