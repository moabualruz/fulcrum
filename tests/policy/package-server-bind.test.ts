import { describe, expect, it } from "vitest";
import { PolicyEnforcementService } from "@fulcrum/core";
import { enforceServerBindPolicy } from "../../apps/server/src/bind-policy.js";

class MemoryDecisionRepository {
  decisions = new Map<string, any>();

  save(decision: any): any {
    this.decisions.set(decision.policyDecisionId, decision);
    return decision;
  }

  get(policyDecisionId: string): any {
    return this.decisions.get(policyDecisionId);
  }

  listPending(): any[] {
    return [...this.decisions.values()].filter((decision) => decision.status === "approval_required");
  }
}

class MemoryEventRepository {
  sequence = 0;

  append(event: any): any {
    return { ...event, sequence: this.sequence++ };
  }
}

describe("package server bind policy", () => {
  it("allows loopback binds by default", () => {
    const policy = new PolicyEnforcementService(
      new MemoryDecisionRepository(),
      new MemoryEventRepository()
    );
    expect(enforceServerBindPolicy({ hostname: "127.0.0.1", port: 3410, policy })).toEqual({
      hostname: "127.0.0.1"
    });
    expect(enforceServerBindPolicy({ hostname: "localhost", port: 3410, policy })).toEqual({
      hostname: "localhost"
    });
  });

  it("requires policy approval for public packaged server binds", () => {
    const policy = new PolicyEnforcementService(
      new MemoryDecisionRepository(),
      new MemoryEventRepository()
    );
    expect(() => enforceServerBindPolicy({ hostname: "0.0.0.0", port: 3410, policy })).toThrow(
      /approval/i
    );
  });
});
