import { describe, expect, it } from "vitest";
import { PolicyEnforcementService, ResetUninstallPreviewService } from "@fulcrum/core";
import type { PolicyDecision, RunEvent } from "@fulcrum/shared";

class Decisions {
  records = new Map<string, PolicyDecision>();
  save(decision: PolicyDecision) {
    this.records.set(decision.policyDecisionId, decision);
    return decision;
  }
  get(policyDecisionId: string) {
    return this.records.get(policyDecisionId);
  }
  listPending() {
    return [...this.records.values()].filter((decision) => decision.status === "approval_required");
  }
}

class Events {
  append(event: Omit<RunEvent, "sequence"> & { sequence?: number }): RunEvent {
    return { ...event, sequence: event.sequence ?? 0 };
  }
}

describe("reset and uninstall preview policy", () => {
  it("requires approval and preserves backups/user work by default", () => {
    const service = new ResetUninstallPreviewService(
      new PolicyEnforcementService(new Decisions(), new Events())
    );

    const reset = service.preview({ action: "reset", stateRoot: "/tmp/fulcrum" });
    const uninstall = service.preview({ action: "uninstall", stateRoot: "/tmp/fulcrum" });
    const purge = service.preview({
      action: "uninstall",
      stateRoot: "/tmp/fulcrum",
      purgeBackups: true
    });

    expect(reset.policyDecision?.status).toBe("approval_required");
    expect(reset.policyDecision?.action).toBe("destructive");
    expect(uninstall.preserve).toEqual(expect.arrayContaining(["/tmp/fulcrum/backups"]));
    expect(uninstall.preserve).toEqual(
      expect.arrayContaining(["registered project worktrees and repositories"])
    );
    expect(purge.policyDecision?.action).toBe("backup_purge");
    expect(purge.purge).toEqual(["/tmp/fulcrum/backups"]);
    expect(purge.preserve).not.toContain("/tmp/fulcrum/backups");
  });
});
