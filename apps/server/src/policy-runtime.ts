import type { PolicyDecision, RunEvent } from "@fulcrum/shared";

export class MemoryPolicyDecisionRepository {
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

export class MemoryPolicyEventRepository {
  private sequence = 0;

  append(event: Omit<RunEvent, "sequence"> & { sequence?: number }): RunEvent {
    return { ...event, sequence: event.sequence ?? this.sequence++ };
  }
}
