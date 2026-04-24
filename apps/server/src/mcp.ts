import type { Hono } from "hono";
import {
  createMcpResourceDefinitions,
  createMcpToolDefinitions,
  listMcpToolVisibility,
  type FulcrumMcpRuntime
} from "@fulcrum/mcp";

export function registerMcpRoutes(app: Hono, runtime: FulcrumMcpRuntime): void {
  app.get("/api/v1/mcp/tools", (context) =>
    context.json({
      schemaVersion: "1.0",
      status: "ok",
      data: listMcpToolVisibility(createMcpToolDefinitions(runtime)),
      redactionStatus: "not_applicable"
    })
  );

  app.get("/api/v1/mcp/resources", (context) =>
    context.json({
      schemaVersion: "1.0",
      status: "ok",
      data: createMcpResourceDefinitions(runtime).map(({ name, uri, description }) => ({
        name,
        uri,
        description
      })),
      redactionStatus: "not_applicable"
    })
  );
}
