import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CommonToolResponseSchema, MCP_TOOL_NAMES } from "@fulcrum/shared";
import {
  createMcpResourceDefinitions,
  createMcpToolDefinitions,
  listMcpToolVisibility
} from "@fulcrum/mcp";
import { createTestMcpRuntime } from "../helpers/mcp-runtime.js";

describe("MCP tool schemas", () => {
  it("exposes every US13 tool with schema, aliases, and permission metadata", () => {
    const runtime = createTestMcpRuntime(mkdtempSync(path.join(tmpdir(), "fulcrum-mcp-tools-")));
    const definitions = createMcpToolDefinitions(runtime);
    expect(definitions.map((tool) => tool.name)).toEqual([...MCP_TOOL_NAMES]);
    expect(definitions.every((tool) => tool.description.length > 0)).toBe(true);
    expect(definitions.every((tool) => tool.inputSchema.safeParse({}).success !== undefined)).toBe(
      true
    );
    expect(
      listMcpToolVisibility(definitions).find((tool) => tool.name === "fulcrum_run_start")
        ?.permission
    ).toBe("policy_gated");
    expect(definitions.find((tool) => tool.name === "fulcrum_doctor_status")?.aliases).toContain(
      "fulcrum.doctor.status"
    );
  });

  it("exposes contracted resources and structured machine errors", async () => {
    const runtime = createTestMcpRuntime(mkdtempSync(path.join(tmpdir(), "fulcrum-mcp-res-")));
    const resources = createMcpResourceDefinitions(runtime);
    expect(resources.map((resource) => resource.uri)).toEqual([
      "fulcrum://projects/{projectId}",
      "fulcrum://tasks/{taskId}",
      "fulcrum://runs/{runId}",
      "fulcrum://context-packs/{contextPackId}",
      "fulcrum://artifacts/{artifactId}",
      "fulcrum://doctor",
      "fulcrum://mcp-call-log"
    ]);

    const missingTask = await createMcpToolDefinitions(runtime)
      .find((tool) => tool.name === "fulcrum_task_get")
      ?.execute({ taskId: "task_missing" });

    expect(CommonToolResponseSchema.parse(missingTask).status).toBe("error");
    expect(missingTask?.error?.code).toBe("NOT_FOUND");
    expect(missingTask?.error?.nextAction).toContain("Verify");
  });

  it("returns real repo-map and honest repo-pack fallback evidence", async () => {
    const runtime = createTestMcpRuntime(mkdtempSync(path.join(tmpdir(), "fulcrum-mcp-repo-")));
    const tools = createMcpToolDefinitions(runtime);

    const repoMap = await tools
      .find((tool) => tool.name === "fulcrum_repo_map_get")
      ?.execute({ projectId: runtime.project.projectId });
    const repoPack = await tools
      .find((tool) => tool.name === "fulcrum_repomix_pack")
      ?.execute({ projectId: runtime.project.projectId });

    expect(CommonToolResponseSchema.parse(repoMap).status).toBe("ok");
    expect(repoMap?.data).toMatchObject({
      toolIdentity: "fulcrum.local-repo-map",
      refs: [expect.objectContaining({ path: "README.md" })]
    });
    expect(CommonToolResponseSchema.parse(repoPack).status).toBe("ok");
    expect(repoPack?.data).toMatchObject({
      redactionStatus: "needs_review",
      sourceRefs: [expect.objectContaining({ label: "README.md" })]
    });
    expect(["repomix", "fulcrum.local-repo-pack"]).toContain(repoPack?.data?.toolIdentity);
  });
});
