import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "@fulcrum/policy";

describe("worktree merge readiness policy", () => {
  it("requires operator approval for merge and cleanup readiness actions", () => {
    const cleanup = evaluatePolicy({
      action: "worktree_cleanup",
      subjectType: "worktree",
      subjectId: "wt_01",
      requester: "operator",
      preview: true
    });
    const merge = evaluatePolicy({
      action: "destructive",
      subjectType: "worktree_merge",
      subjectId: "wt_01",
      requester: "operator",
      preview: true
    });

    expect(cleanup.status).toBe("approval_required");
    expect(merge.status).toBe("approval_required");
    expect(cleanup.nextAction).toContain("approve");
    expect(merge.nextAction).toContain("approve");
  });
});
