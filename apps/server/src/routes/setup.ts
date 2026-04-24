import type { Hono } from "hono";
import { applySetup, buildSetupPreview, type SetupApplyPorts } from "@fulcrum/core";

export function registerSetupRoutes(app: Hono, ports: SetupApplyPorts): void {
  app.get("/api/v1/setup/preview", (context) =>
    context.json({
      schemaVersion: "1.0",
      status: "ok",
      data: buildSetupPreview(),
      redactionStatus: "not_applicable"
    })
  );

  app.post("/api/v1/setup/apply", async (context) =>
    context.json({
      schemaVersion: "1.0",
      status: "ok",
      data: await applySetup(ports),
      redactionStatus: "not_applicable"
    })
  );
}
