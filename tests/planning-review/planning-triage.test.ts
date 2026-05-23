import { describe, expect, test } from "bun:test";

import {
  applyPlanningTriageDecision,
  classifyPlanningTriage,
} from "@planning-review/application/features/planning-triage.ts";

describe("planning triage", () => {
  test("names risk, review gates, evidence, and explainable reason", () => {
    const triage = classifyPlanningTriage({
      title: "Passkey authentication plan",
      markdown: "Change auth session policy and permission checks in the identity service.",
      changedPaths: ["services/identity-access/src/application/auth/passkeys.ts"],
    });

    expect(triage.risk).toBe("high");
    expect(triage.requiredReviewTypes).toEqual(["security_review", "code_review", "uat"]);
    expect(triage.evidenceRequirements.map((requirement) => requirement.id)).toEqual([
      "security-review-notes",
      "code-review-feedback",
      "uat-evidence",
    ]);
    expect(triage.reason).toContain("security-sensitive");
    expect(triage.reason).toContain("requires security_review, code_review, uat");
  });

  test("blocks high-risk plans from skipping code review or UAT without waiver", () => {
    const triage = classifyPlanningTriage({
      title: "Service boundary migration",
      markdown: "Move domain logic into service boundary and update TypeORM migration behavior.",
    });

    const decision = applyPlanningTriageDecision({
      triage,
      selectedReviewTypes: ["security_review"],
    });

    expect(decision.allowed).toBe(false);
    expect(decision.missingReviewTypes).toEqual(["code_review", "uat"]);
    expect(decision.reason).toContain("unless a named approver records a waiver reason");
  });

  test("records manual override approver and reason", () => {
    const triage = classifyPlanningTriage({
      title: "Auth copy and policy plan",
      markdown: "Auth policy copy changes need security review, but UAT is waived for duplicate wording.",
    });

    const decision = applyPlanningTriageDecision({
      triage,
      selectedReviewTypes: ["security_review", "code_review"],
      override: {
        approverId: "user-1",
        reason: "duplicate wording already covered by existing UAT evidence",
        createdAt: "2026-05-18T12:00:00.000Z",
      },
    });

    expect(decision.allowed).toBe(true);
    expect(decision.override).toMatchObject({
      approverId: "user-1",
      reason: "duplicate wording already covered by existing UAT evidence",
    });
    expect(decision.reason).toContain("manual override by user-1");
  });
});

