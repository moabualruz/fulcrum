import type { Hono } from "hono";
import type {
  BackupManifestService,
  RebuildOrchestrator,
  RecoveryExportService,
  ResetUninstallPreviewService,
  RestoreValidationService
} from "@fulcrum/core";

export interface RecoveryRouteDeps {
  backups: BackupManifestService;
  restore: RestoreValidationService;
  exports: RecoveryExportService;
  rebuild: RebuildOrchestrator;
  previews: ResetUninstallPreviewService;
  stateRoot?: string;
}

export function registerRecoveryRoutes(app: Hono, deps: RecoveryRouteDeps): void {
  app.post("/api/v1/backups", async (c) => {
    const body = (await c.req.json()) as {
      stateRoot: string;
      outputRoot?: string;
      includeContextPacks?: boolean;
    };
    return c.json(
      {
        schemaVersion: "1.0",
        status: "ok",
        data: deps.backups.create({
          ...body,
          outputRoot: body.outputRoot ?? deps.stateRoot ?? "."
        })
      },
      201
    );
  });

  app.get("/api/v1/backups", (c) => {
    return c.json({ schemaVersion: "1.0", status: "ok", data: deps.backups.list() });
  });

  app.post("/api/v1/restore", async (c) => {
    const body = (await c.req.json()) as { backupId: string; target: string };
    const data = deps.restore.validate(body.backupId, body.target);
    return c.json({ schemaVersion: "1.0", status: data.valid ? "ok" : "error", data });
  });

  app.post("/api/v1/rebuild", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      availableSources?: Partial<Record<string, number>>;
    };
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: deps.rebuild.rebuild(body.availableSources)
    });
  });

  app.post("/api/v1/exports", async (c) => {
    const body = (await c.req.json()) as {
      outputRoot: string;
      format?: "json" | "jsonl";
      entityClasses?: string[];
      stateRoot?: string;
      policyDecisionId?: string;
    };
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: deps.exports.create({
        outputRoot: body.outputRoot ?? deps.stateRoot ?? ".",
        format: body.format ?? "json",
        entityClasses: body.entityClasses ?? ["projects", "tasks", "runs"],
        stateRoot: body.stateRoot ?? deps.stateRoot,
        policyDecisionId: body.policyDecisionId
      })
    });
  });

  app.post("/api/v1/exports/preview", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      outputRoot?: string;
      format?: "json" | "jsonl";
      entityClasses?: string[];
      stateRoot?: string;
    };
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: deps.exports.preview({
        outputRoot: body.outputRoot ?? deps.stateRoot ?? ".",
        format: body.format ?? "json",
        entityClasses: body.entityClasses ?? ["projects", "tasks", "runs"],
        stateRoot: body.stateRoot ?? deps.stateRoot
      })
    });
  });

  app.post("/api/v1/reset/preview", async (c) => {
    const body = (await c.req.json()) as { stateRoot: string; purgeBackups?: boolean };
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: deps.previews.preview({ action: "reset", ...body })
    });
  });

  app.post("/api/v1/uninstall/preview", async (c) => {
    const body = (await c.req.json()) as { stateRoot: string; purgeBackups?: boolean };
    return c.json({
      schemaVersion: "1.0",
      status: "ok",
      data: deps.previews.preview({ action: "uninstall", ...body })
    });
  });
}
