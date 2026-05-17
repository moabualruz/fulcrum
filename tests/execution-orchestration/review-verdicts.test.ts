import { describe, expect, test } from "bun:test";

import {
  buildReviewToolResponse,
  extractReviewVerdict,
  getCodeReviewDoneBlocker,
  planRethinkRecovery,
  recordReviewVerdict,
  type CodeReviewVerdictState,
} from "@execution-orchestration/domain/review-verdicts.ts";

function emptyVerdicts(): CodeReviewVerdictState {
  return new Map();
}

describe("dependency orchestration review verdict handling", () => {
  test("extracts verdicts using reviewer JSON, heading, and line fallback rules", () => {
    expect(extractReviewVerdict('```json\n{"verdict": "approve"}\n```')).toBe("APPROVE");
    expect(extractReviewVerdict("### Verdict: **REVISE**\n\nFix it")).toBe("REVISE");
    expect(extractReviewVerdict("> Decision - rethink\n\nWrong approach")).toBe("RETHINK");
    expect(extractReviewVerdict("Body text mentions APPROVE but has no verdict line")).toBe("UNAVAILABLE");
  });

  test("tracks code REVISE independently per step and blocks only matching done updates", () => {
    const afterRevise = recordReviewVerdict(emptyVerdicts(), {
      stepIndex: 0,
      reviewType: "code",
      verdict: "REVISE",
    });

    expect(getCodeReviewDoneBlocker(afterRevise, { stepNumber: 1 })).toContain(
      "Cannot mark Step 1 as done",
    );
    expect(getCodeReviewDoneBlocker(afterRevise, { stepNumber: 2 })).toBeUndefined();

    const afterSecondStepRevise = recordReviewVerdict(afterRevise, {
      stepIndex: 1,
      reviewType: "code",
      verdict: "REVISE",
    });

    expect(getCodeReviewDoneBlocker(afterSecondStepRevise, { stepNumber: 1 })).toContain(
      "Step 1",
    );
    expect(getCodeReviewDoneBlocker(afterSecondStepRevise, { stepNumber: 2 })).toContain(
      "Step 2",
    );
  });

  test("code APPROVE clears the REVISE block and plan REVISE remains advisory", () => {
    const afterCodeRevise = recordReviewVerdict(emptyVerdicts(), {
      stepIndex: 0,
      reviewType: "code",
      verdict: "REVISE",
    });
    const afterPlanRevise = recordReviewVerdict(afterCodeRevise, {
      stepIndex: 0,
      reviewType: "plan",
      verdict: "REVISE",
    });

    expect(getCodeReviewDoneBlocker(afterPlanRevise, { stepNumber: 1 })).toContain("REVISE");

    const afterCodeApprove = recordReviewVerdict(afterPlanRevise, {
      stepIndex: 0,
      reviewType: "code",
      verdict: "APPROVE",
    });

    expect(getCodeReviewDoneBlocker(afterCodeApprove, { stepNumber: 1 })).toBeUndefined();
  });

  test("formats code REVISE with re-review instructions and plan REVISE as advisory feedback", () => {
    const codeText = buildReviewToolResponse({
      stepIndex: 0,
      stepName: "Implement",
      reviewType: "code",
      verdict: "REVISE",
      review: "Missing error handling",
    });

    expect(codeText).toContain("cannot be marked done");
    expect(codeText).toContain("fn_review_step(step=0");
    expect(codeText).toContain('type="code"');
    expect(codeText).toContain("Missing error handling");

    expect(buildReviewToolResponse({
      stepIndex: 0,
      stepName: "Implement",
      reviewType: "plan",
      verdict: "REVISE",
      review: "Plan issue",
    })).toBe("REVISE\n\nPlan issue");
  });

  test("plans code RETHINK with git reset, session rewind, pending reset, and alternate-approach prompt", () => {
    const recovery = planRethinkRecovery({
      stepIndex: 0,
      reviewType: "code",
      baseline: "abc123",
      checkpointId: "leaf-1",
      review: "Using polling instead of events is wrong",
      summary: "Bad approach",
    });

    expect(recovery.gitResetBaseline).toBe("abc123");
    expect(recovery.rewindCheckpointId).toBe("leaf-1");
    expect(recovery.resetStepStatus).toEqual({ stepIndex: 0, status: "pending" });
    expect(recovery.logAction).toContain("git reset to abc123");
    expect(recovery.branchFallbackSummary).toBe("RETHINK: Bad approach");
    expect(recovery.responseText).toContain("Your previous approach was rejected");
    expect(recovery.responseText).toContain("Do NOT repeat the rejected strategy");
  });

  test("plans plan RETHINK without git reset but with plan-specific rewind prompt", () => {
    const recovery = planRethinkRecovery({
      stepIndex: 0,
      reviewType: "plan",
      baseline: "ignored-sha",
      checkpointId: "leaf-plan",
      review: "Plan overlooks edge cases",
      summary: "Bad plan",
    });

    expect(recovery.gitResetBaseline).toBeUndefined();
    expect(recovery.rewindCheckpointId).toBe("leaf-plan");
    expect(recovery.resetStepStatus).toEqual({ stepIndex: 0, status: "pending" });
    expect(recovery.logAction).toContain("plan rewound");
    expect(recovery.responseText).toContain("Your plan was rejected");
    expect(recovery.responseText).toContain("Take a different approach to planning this step");
    expect(recovery.responseText).toContain("Plan overlooks edge cases");
  });
});
