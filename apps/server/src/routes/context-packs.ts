import type { Hono } from "hono";
import {
  exportContextPack,
  type ContextExportFormat,
  type ContextPackBuilder
} from "@fulcrum/core";

const contextExportFormats = new Set<ContextExportFormat>(["markdown", "json", "prompt", "mcp"]);

function isContextExportFormat(format: string): format is ContextExportFormat {
  return contextExportFormats.has(format as ContextExportFormat);
}

export function registerContextPackRoutes(app: Hono, context: ContextPackBuilder): void {
  app.post("/api/v1/context-packs", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      taskId?: string;
      runId?: string;
      budget?: number;
      lanes?: string[];
      offline?: boolean;
      memoryAvailable?: boolean;
      codeAvailable?: boolean;
    };
    if (!body.taskId) {
      return c.json(
        {
          schemaVersion: "1.0",
          requestId: "local",
          status: "error",
          error: { code: "INVALID_INPUT", message: "taskId required", actionable: true }
        },
        400
      );
    }
    try {
      return c.json({
        schemaVersion: "1.0",
        requestId: "local",
        status: "ok",
        data: context.build({
          taskId: body.taskId,
          runId: body.runId,
          budget: body.budget,
          lanes: body.lanes,
          offline: body.offline,
          memoryAvailable: body.memoryAvailable,
          codeAvailable: body.codeAvailable
        })
      });
    } catch (error) {
      return c.json(
        {
          schemaVersion: "1.0",
          requestId: "local",
          status: "error",
          error: {
            code: "CONTEXT_BUILD_FAILED",
            message: error instanceof Error ? error.message : "Context build failed",
            actionable: true
          }
        },
        404
      );
    }
  });

  app.get("/api/v1/context-packs/:contextPackId", (c) => {
    const data = context.get(c.req.param("contextPackId"));
    const format = c.req.query("format");
    if (data && format) {
      if (!isContextExportFormat(format)) {
        return c.json(
          {
            schemaVersion: "1.0",
            requestId: "local",
            status: "error",
            error: {
              code: "INVALID_INPUT",
              message: `Unsupported context export format: ${format}`,
              actionable: true
            }
          },
          400
        );
      }
      return c.json({
        schemaVersion: "1.0",
        requestId: "local",
        status: "ok",
        data: { format, content: exportContextPack(data, format) }
      });
    }
    return c.json(
      {
        schemaVersion: "1.0",
        requestId: "local",
        status: data ? "ok" : "error",
        data,
        error: data
          ? undefined
          : { code: "NOT_FOUND", message: "Context pack not found", actionable: true }
      },
      data ? 200 : 404
    );
  });
}
