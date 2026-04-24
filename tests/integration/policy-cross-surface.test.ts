import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { PolicyEnforcementService } from "@fulcrum/core";
import type { PolicyDecision, RunEvent } from "@fulcrum/shared";
import { checkPolicyCommand } from "../../apps/cli/src/commands/policy.js";
import { registerPolicyRoutes } from "../../apps/server/src/routes/policy.js";

class MemoryDecisions {
  private readonly decisions = new Map<string, PolicyDecision>();
  save(decision: PolicyDecision): PolicyDecision {
    this.decisions.set(decision.policyDecisionId, decision);
    return decision;
  }
  get(policyDecisionId: string): PolicyDecision | undefined {
    return this.decisions.get(policyDecisionId);
  }
  listPending(): PolicyDecision[] {
    return [...this.decisions.values()].filter(
      (decision) => decision.status === "approval_required"
    );
  }
}

class MemoryEvents {
  append(event: Omit<RunEvent, "sequence"> & { sequence?: number }): RunEvent {
    return { ...event, sequence: event.sequence ?? 0 };
  }
}

function request() {
  return {
    action: "sensitive_export",
    subjectType: "export",
    subjectId: "export_release",
    requester: "operator",
    preview: true,
    localOnly: false
  };
}

describe("policy cross-surface parity", () => {
  it("returns same decision status from CLI, API, and MCP-style core calls", async () => {
    const service = new PolicyEnforcementService(new MemoryDecisions(), new MemoryEvents());
    const cli = checkPolicyCommand(service, request());
    const mcp = service.check(request()).decision;
    const app = new Hono();
    registerPolicyRoutes(app, service);

    const response = await app.request("/api/v1/policy/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request())
    });
    const api = (await response.json()) as { data: PolicyDecision };

    expect([cli.status, api.data.status, mcp.status]).toEqual([
      "approval_required",
      "approval_required",
      "approval_required"
    ]);
    expect(api.data.action).toBe(cli.action);
  });
});
