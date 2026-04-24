import type { Hono } from "hono";
import type { AdapterRegistryService } from "@fulcrum/core";
import { buildAdapterDegradationSummary } from "@fulcrum/core";

export function registerAdapterRoutes(app: Hono, registry: AdapterRegistryService): void {
  app.get("/api/v1/adapters", async (context) =>
    context.json({
      schemaVersion: "1.0",
      status: "ok",
      data: await registry.listHealth(),
      redactionStatus: "not_applicable"
    })
  );

  app.get("/api/v1/adapters/health", async (context) =>
    context.json({
      schemaVersion: "1.0",
      status: "ok",
      data: await buildAdapterDegradationSummary(registry),
      redactionStatus: "not_applicable"
    })
  );

  app.post("/api/v1/adapters/:adapterId/health-check", async (context) =>
    context.json({
      schemaVersion: "1.0",
      status: "ok",
      data: await registry.health(context.req.param("adapterId")),
      redactionStatus: "not_applicable"
    })
  );

  app.post("/api/v1/adapters/:adapterId/enable", async (context) =>
    context.json({
      schemaVersion: "1.0",
      status: "ok",
      data: await registry.enable(context.req.param("adapterId")),
      redactionStatus: "not_applicable"
    })
  );

  app.post("/api/v1/adapters/:adapterId/disable", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as { reason?: string };
    return context.json({
      schemaVersion: "1.0",
      status: "ok",
      data: await registry.disable(
        context.req.param("adapterId"),
        body.reason ?? "Operator disabled adapter"
      ),
      redactionStatus: "not_applicable"
    });
  });
}
