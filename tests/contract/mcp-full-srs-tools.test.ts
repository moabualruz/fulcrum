import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createMcpResourceDefinitions,
  createMcpToolDefinitions,
  defaultMcpCallLog
} from "@fulcrum/mcp";
import { MCP_TOOL_NAMES } from "@fulcrum/shared";
import { createTestMcpRuntime } from "../helpers/mcp-runtime.js";

describe("full SRS MCP tool coverage and call logging", () => {
  it("exposes canonical tools, dot aliases, resources, and call-log resource", () => {
    const runtime = createTestMcpRuntime(mkdtempSync(path.join(tmpdir(), "fulcrum-mcp-full-")));
    const tools = createMcpToolDefinitions(runtime);

    expect(tools.map((tool) => tool.name)).toEqual([...MCP_TOOL_NAMES]);
    expect(tools.every((tool) => tool.aliases.length > 0)).toBe(true);
    for (const tool of tools) {
      expect(tool.aliases).toContain(tool.name.replaceAll("_", "."));
    }

    expect(createMcpResourceDefinitions(runtime).map((resource) => resource.uri)).toContain(
      "fulcrum://mcp-call-log"
    );
  });

  it("records every MCP tool call with redacted parameters and result summary", async () => {
    defaultMcpCallLog.clear();
    const runtime = createTestMcpRuntime(mkdtempSync(path.join(tmpdir(), "fulcrum-mcp-log-")));
    const tool = createMcpToolDefinitions(runtime).find(
      (definition) => definition.name === "fulcrum_doctor_status"
    );

    const response = await tool?.execute({ caller: "agent", token: "secret-value" });

    expect(response?.status).toBe("ok");
    const [entry] = defaultMcpCallLog.list();
    expect(entry.toolName).toBe("fulcrum_doctor_status");
    expect(entry.caller).toBe("agent");
    expect(entry.parameterHash).toHaveLength(64);
    expect(entry.resultSummary).toBe("ok");
    expect(entry.redactedParameters).toMatchObject({ token: "[REDACTED]" });
  });
});
