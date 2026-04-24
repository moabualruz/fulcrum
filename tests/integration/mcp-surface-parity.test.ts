import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMcpToolDefinitions } from "@fulcrum/mcp";
import { createTestMcpRuntime } from "../helpers/mcp-runtime.js";

describe("MCP surface parity", () => {
  it("matches CLI-style task state and cockpit-visible tool permissions", async () => {
    const runtime = createTestMcpRuntime(mkdtempSync(path.join(tmpdir(), "fulcrum-mcp-parity-")));
    const tools = createMcpToolDefinitions(runtime);
    const taskList = await tools
      .find((tool) => tool.name === "fulcrum_task_list")
      ?.execute({
        projectId: runtime.project.projectId
      });
    const cliShape = {
      schemaVersion: "1.0",
      status: "ok",
      data: runtime.tasks.list(runtime.project.projectId),
      redactionStatus: "not_applicable"
    };

    expect(taskList?.status).toBe(cliShape.status);
    expect(taskList?.redactionStatus).toBe(cliShape.redactionStatus);
    expect((taskList?.data as unknown[]).length).toBe(cliShape.data.length);
    expect(tools.some((tool) => tool.permission === "policy_gated")).toBe(true);
  });
});
