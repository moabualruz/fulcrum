import type { Hono } from "hono";
import { buildRepositoryComplianceEvidence, type ComplianceService } from "@fulcrum/core";

export function registerComplianceRoutes(
  app: Hono,
  service: ComplianceService,
  defaultRootDir: string
): void {
  app.get("/api/v1/compliance", (context) => {
    const sources = context.req.query("sources")?.split(",").filter(Boolean);
    const rootDir = context.req.query("root") ?? defaultRootDir;
    const initialAudit = service.audit({
      rootDir,
      sources: sources?.length ? sources : undefined
    });
    const data = service.audit({
      rootDir: context.req.query("root") ?? defaultRootDir,
      sources: sources?.length ? sources : undefined,
      evidence: buildRepositoryComplianceEvidence(initialAudit, rootDir)
    });
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
    const sources = context.req.query("sources")?.split(",").filter(Boolean);
    const rootDir = context.req.query("root") ?? defaultRootDir;
    const initialAudit = service.audit({
      rootDir,
      sources: sources?.length ? sources : undefined
    });
    const data = service.export({
      format,
      output,
      audit: service.audit({
        rootDir,
        sources: sources?.length ? sources : undefined,
        evidence: buildRepositoryComplianceEvidence(initialAudit, rootDir)
      })
    });
    return context.json({
      schemaVersion: "1.0",
      status: "ok",
      data,
      redactionStatus: "not_applicable"
    });
  });
}
