import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

interface ToolResponse<T = unknown> {
  status: "ok" | "error";
  data?: T;
  error?: { code: string };
  policyDecisionIds: string[];
}

function toolResponse<T>(result: { structuredContent?: unknown }): ToolResponse<T> {
  return result.structuredContent as ToolResponse<T>;
}

describe("stdio MCP validation-agent flow", () => {
  it("uses stdio MCP tools to fetch task, build context, search, attach, check policy, and complete", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "fulcrum-mcp-agent-"));
    const artifactPath = path.join(root, "validation-agent-output.txt");
    writeFileSync(artifactPath, "validation output\n");

    const client = new Client({ name: "fulcrum-validation-agent", version: "0.1.0" });
    const transport = new StdioClientTransport({
      command: "pnpm",
      args: [
        "exec",
        "tsx",
        "--tsconfig",
        "tsconfig.base.json",
        "tests/helpers/mcp-stdio-server.ts",
        root
      ],
      cwd: process.cwd(),
      stderr: "pipe"
    });

    try {
      await client.connect(transport);
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toContain("fulcrum_task_get");

      const taskList = toolResponse<Array<{ taskId: string }>>(
        await client.callTool({
          name: "fulcrum_task_list",
          arguments: { projectId: "proj_mcp" }
        })
      );
      const taskId = taskList.data?.[0]?.taskId;
      expect(taskId).toMatch(/^task_/);

      const task = toolResponse<{ task: { taskId: string }; project: { projectId: string } }>(
        await client.callTool({ name: "fulcrum_task_get", arguments: { taskId } })
      );
      const context = toolResponse(
        await client.callTool({
          name: "fulcrum_context_build",
          arguments: { taskId, offlineOnly: true }
        })
      );
      const memory = toolResponse<unknown[]>(
        await client.callTool({
          name: "fulcrum_memory_search",
          arguments: { projectId: "proj_mcp", query: "Fulcrum" }
        })
      );
      const code = toolResponse<{ count: number }>(
        await client.callTool({
          name: "fulcrum_code_search",
          arguments: { projectId: "proj_mcp", query: "Fulcrum", modes: ["exact"] }
        })
      );
      const run = toolResponse<{ runId: string }>(
        await client.callTool({
          name: "fulcrum_run_start",
          arguments: { taskId, agentId: "agent_mcp" }
        })
      );
      const runId = run.data?.runId;
      const heartbeat = toolResponse(
        await client.callTool({
          name: "fulcrum_run_heartbeat",
          arguments: { runId, source: "validation-agent", message: "alive" }
        })
      );
      const artifact = toolResponse<{ artifactId: string; projectId?: string; taskId?: string }>(
        await client.callTool({
          name: "fulcrum_artifact_attach",
          arguments: { runId, type: "log", localRef: artifactPath, summary: "validation output" }
        })
      );
      const policy = toolResponse<{ decision: { status: string }; event: { eventId: string } }>(
        await client.callTool({
          name: "fulcrum_policy_check",
          arguments: {
            action: "permanent_memory",
            subjectType: "memory",
            subjectId: "mem_validation",
            requester: "validation-agent",
            projectId: "proj_mcp",
            runId,
            taskId,
            preview: true
          }
        })
      );
      const qualityPreview = toolResponse(
        await client.callTool({
          name: "fulcrum_quality_gate_run",
          arguments: {
            projectId: "proj_mcp",
            gateName: "gate_mcp_validation",
            runId,
            taskId,
            cwd: root,
            previewOnly: true
          }
        })
      );
      const completed = toolResponse<{ status: string }>(
        await client.callTool({
          name: "fulcrum_run_complete",
          arguments: {
            runId,
            summary: "done",
            outcome: "succeeded",
            artifactIds: [artifact.data?.artifactId]
          }
        })
      );

      expect(task.status).toBe("ok");
      expect(task.data?.project.projectId).toBe("proj_mcp");
      expect(context.status).toBe("ok");
      expect(memory.status).toBe("ok");
      expect(code.data?.count).toBe(1);
      expect(heartbeat.status).toBe("ok");
      expect(artifact.data?.projectId).toBe("proj_mcp");
      expect(artifact.data?.taskId).toBe(taskId);
      expect(policy.status).toBe("ok");
      expect(policy.data?.decision.status).toBe("approval_required");
      expect(policy.data?.event.eventId).toMatch(/^evt_/);
      expect(qualityPreview.status).toBe("error");
      expect(qualityPreview.error?.code).toBe("APPROVAL_REQUIRED");
      expect(completed.data?.status).toBe("completed");
    } finally {
      await client.close();
    }
  });
});
