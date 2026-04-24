import type { Hono } from "hono";
import type { ComplianceService } from "@fulcrum/core";

export function registerComplianceRoutes(app: Hono, service: ComplianceService): void {
  app.get("/api/v1/compliance", (context) => {
    const data = service.audit({ rootDir: process.cwd() });
    return context.json({
      schemaVersion: "1.0",
      status: data.pass ? "ok" : "blocked",
      data,
      redactionStatus: "not_applicable"
    });
  });

  app.get("/api/v1/compliance/requirements/:requirementId", (context) => {
    const data = service.show(context.req.param("requirementId"));
    return context.json({
      schemaVersion: "1.0",
      status: data ? "ok" : "error",
      data,
      redactionStatus: "not_applicable"
    });
  });

  app.get("/api/v1/compliance/export", (context) => {
    const format = context.req.query("format") === "markdown" ? "markdown" : "json";
    const output = context.req.query("output") ?? "fulcrum-compliance.json";
    const data = service.export({ format, output, audit: service.audit({ rootDir: process.cwd() }) });
    return context.json({
      schemaVersion: "1.0",
      status: "ok",
      data,
      redactionStatus: "not_applicable"
    });
  });
}
