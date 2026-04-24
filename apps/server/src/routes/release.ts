import type { Hono } from "hono";
import type { ComplianceService } from "@fulcrum/core";
import { ReleaseValidator } from "@fulcrum/core";

export function registerReleaseRoutes(
  app: Hono,
  compliance: ComplianceService,
  defaultRootDir: string
): void {
  app.post("/api/v1/release/validate", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as {
      evidence?: string;
      localOnly?: boolean;
      root?: string;
    };
    const validator = new ReleaseValidator(compliance);
    const data = await validator.validate({
      rootDir: body.root ?? defaultRootDir,
      evidenceDir: body.evidence ?? "fulcrum-release-evidence",
      localOnly: Boolean(body.localOnly)
    });
    return context.json({
      schemaVersion: "1.0",
      status: data.pass ? "ok" : "blocked",
      data,
      redactionStatus: data.redactionStatus
    });
  });
}
