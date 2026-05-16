import { describe, expect, test } from "bun:test";

import { planDenyFeedback } from "@planning-review/application/reviews/shared/feedback-templates.ts";

describe("review planning behavior behavior", () => {
  test("plan deny is identical across integrations modulo tool name", () => {
    const normalize = (value: string) =>
      value.replace(/ExitPlanMode|submit_plan|exit_plan_mode|submit_plan/g, "TOOL");

    const feedback = "## 1. Remove auth section\n> Not needed anymore.";
    const hook = normalize(planDenyFeedback(feedback, "ExitPlanMode"));
    const opencode = normalize(planDenyFeedback(feedback, "submit_plan"));
    const pi = normalize(planDenyFeedback(feedback, "submit_plan"));

    expect(hook).toBe(opencode);
    expect(opencode).toBe(pi);
  });

  test("plan deny preserves feedback content verbatim", () => {
    const feedback = "## 1. Change auth\n**From:**\n```\nold code\n```\n**To:**\n```\nnew code\n```";
    expect(planDenyFeedback(feedback)).toContain(feedback);
  });

  test("plan deny handles empty feedback and preserves plan title instruction", () => {
    const result = planDenyFeedback("");
    expect(result.length).toBeGreaterThan(50);
    expect(result).toBe(result.trimEnd());
    expect(result.toLowerCase()).toContain("title");
    expect(result.toLowerCase()).toContain("heading");
    expect(result).toContain("Plan changes requested");
  });

  test("plan deny can include file hint for file-based integrations", () => {
    const result = planDenyFeedback("feedback", "submit_plan", {
      planFilePath: "plans/auth.md",
    });

    expect(result).toContain("plans/auth.md");
    expect(result).toContain("edit this file");
    expect(result).toContain("submit_plan");
  });
});
