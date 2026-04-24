import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMcpToolDefinitions } from "@fulcrum/mcp";
import { createTestMcpRuntime } from "../helpers/mcp-runtime.js";

describe("MCP policy gate prevention", () => {
  it("allows draft-only memory writes without permanent-memory approval", async () => {
    const runtime = createTestMcpRuntime(mkdtempSync(path.join(tmpdir(), "fulcrum-mcp-draft-")));
    const tool = createMcpToolDefinitions(runtime).find(
      (entry) => entry.name === "fulcrum_memory_add"
    );
    const response = await tool?.execute({
      projectId: runtime.project.projectId,
      title: "Draft note",
      body: "Keep this as draft",
      sourceRefs: [{ type: "operator_note", uri: "memory://test" }],
      permanent: false
    });

    expect(response?.status).toBe("ok");
    expect(response?.policyDecisionIds).toEqual([]);
  });

  it("returns approval-required response for permanent memory writes", async () => {
    const runtime = createTestMcpRuntime(mkdtempSync(path.join(tmpdir(), "fulcrum-mcp-policy-")));
    const tool = createMcpToolDefinitions(runtime).find(
      (entry) => entry.name === "fulcrum_memory_add"
    );
    const response = await tool?.execute({
      projectId: runtime.project.projectId,
      title: "Permanent note",
      body: "Keep this",
      sourceRefs: [{ type: "operator_note", uri: "memory://test" }],
      permanent: true
    });

    expect(response?.status).toBe("error");
    expect(response?.error?.code).toBe("APPROVAL_REQUIRED");
    expect(response?.policyDecisionIds.length).toBe(1);
  });

  it("returns policy-check decisions as successful audit data", async () => {
    const runtime = createTestMcpRuntime(mkdtempSync(path.join(tmpdir(), "fulcrum-mcp-check-")));
    const tool = createMcpToolDefinitions(runtime).find(
      (entry) => entry.name === "fulcrum_policy_check"
    );
    const response = await tool?.execute({
      action: "permanent_memory",
      subjectType: "memory",
      subjectId: "mem_review",
      requester: "validation-agent",
      projectId: runtime.project.projectId,
      preview: true
    });

    const data = response?.data as { decision: { status: string }; event: { eventId: string } };
    expect(response?.status).toBe("ok");
    expect(data.decision.status).toBe("approval_required");
    expect(data.event.eventId).toMatch(/^evt_/);
    expect(response?.policyDecisionIds.length).toBe(1);
  });

  it("rejects unknown policy actions instead of allowing by typo", async () => {
    const runtime = createTestMcpRuntime(mkdtempSync(path.join(tmpdir(), "fulcrum-mcp-invalid-")));
    const tool = createMcpToolDefinitions(runtime).find(
      (entry) => entry.name === "fulcrum_policy_check"
    );
    const response = await tool?.execute({
      action: "permanent_memroy",
      subjectType: "memory",
      subjectId: "mem_review",
      requester: "validation-agent"
    });

    expect(response?.status).toBe("error");
    expect(response?.error?.code).toBe("INVALID_INPUT");
  });

  it("blocks MCP quality gate shell execution until approved policy is supplied", async () => {
    const runtime = createTestMcpRuntime(mkdtempSync(path.join(tmpdir(), "fulcrum-mcp-gate-")));
    const tool = createMcpToolDefinitions(runtime).find(
      (entry) => entry.name === "fulcrum_quality_gate_run"
    );

    const blocked = await tool?.execute({
      projectId: runtime.project.projectId,
      gateName: "gate_mcp_validation",
      cwd: runtime.project.rootPath
    });

    const { decision } = runtime.policy.check({
      action: "arbitrary_shell",
      subjectType: "quality_gate",
      subjectId: "gate_mcp_validation",
      requester: "operator",
      projectId: runtime.project.projectId,
      preview: true,
      localOnly: true
    });
    const approved = runtime.policy.approve(decision.policyDecisionId, "operator");
    const allowed = await tool?.execute({
      projectId: runtime.project.projectId,
      gateName: "gate_mcp_validation",
      cwd: runtime.project.rootPath,
      policyDecisionId: approved.policyDecisionId
    });

    expect(blocked?.status).toBe("error");
    expect(blocked?.error?.code).toBe("APPROVAL_REQUIRED");
    expect(allowed?.status).toBe("ok");
    expect((allowed?.data as { status: string }).status).toBe("passed");
  });
});
