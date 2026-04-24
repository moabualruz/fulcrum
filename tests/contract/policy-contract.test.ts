import { describe, expect, it } from "vitest";
import { PolicyEnforcementService } from "@fulcrum/core";
import { PolicyDecisionSchema, type PolicyDecision, type RunEvent } from "@fulcrum/shared";
import { enforceServerBindPolicy } from "../../apps/server/src/bind-policy.js";

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
  events: RunEvent[] = [];
  append(event: Omit<RunEvent, "sequence"> & { sequence?: number }): RunEvent {
    const saved = { ...event, sequence: event.sequence ?? this.events.length };
    this.events.push(saved);
    return saved;
  }
}

describe("policy contract", () => {
  it("records approval-required decisions with audit event links", () => {
    const events = new MemoryEvents();
    const service = new PolicyEnforcementService(new MemoryDecisions(), events);
    const { decision } = service.check({
      action: "arbitrary_shell",
      subjectType: "quality_gate",
      subjectId: "gate_lint",
      requester: "operator",
      preview: true,
      localOnly: false
    });

    expect(PolicyDecisionSchema.parse(decision).status).toBe("approval_required");
    expect(decision.approvalRequired).toBe(true);
    expect(decision.subjectType).toBe("quality_gate");
    expect(decision.subjectId).toBe("gate_lint");
    expect(decision.requester).toBe("operator");
    expect(decision.auditEventId).toBe(events.events[0]?.eventId);
  });

  it("guards non-loopback server bind behind policy approval", () => {
    const service = new PolicyEnforcementService(new MemoryDecisions(), new MemoryEvents());
    expect(() =>
      enforceServerBindPolicy({ hostname: "0.0.0.0", port: 4173, policy: service })
    ).toThrow("public_bind requires operator approval.");
  });

  it("allows non-loopback server bind only with matching approved decision", () => {
    const service = new PolicyEnforcementService(new MemoryDecisions(), new MemoryEvents());
    const { decision } = service.check({
      action: "public_bind",
      subjectType: "server_bind",
      subjectId: "0.0.0.0:4173",
      requester: "server",
      preview: true,
      localOnly: false
    });
    const approved = service.approve(decision.policyDecisionId, "operator");

    expect(
      enforceServerBindPolicy({
        hostname: "0.0.0.0",
        port: 4173,
        policy: service,
        approvedDecisionId: approved.policyDecisionId
      }).policyDecisionId
    ).toBe(approved.policyDecisionId);

    expect(() =>
      enforceServerBindPolicy({
        hostname: "0.0.0.0",
        port: 4174,
        policy: service,
        approvedDecisionId: approved.policyDecisionId
      })
    ).toThrow("public_bind requires operator approval.");
  });
});
