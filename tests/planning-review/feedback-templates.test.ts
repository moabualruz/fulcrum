import { describe, expect, test } from "bun:test";

import {
  createCustomReviewFeedbackTemplate,
  listReviewFeedbackTemplates,
  planDenyFeedback,
  renderReviewFeedbackTemplate,
} from "@planning-review/application/reviews/shared/feedback-templates.ts";

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

  test("built-in feedback templates cover planning, UAT, and code review critique patterns", () => {
    const kinds = listReviewFeedbackTemplates().map((template) => template.kind);

    expect(kinds).toContain("missing-criteria");
    expect(kinds).toContain("stale-context");
    expect(kinds).toContain("prototype-mismatch");
    expect(kinds).toContain("test-gap");
    expect(kinds).toContain("code-risk");
  });

  test("template render emits structured fields, readable text, and source reference", () => {
    const rendered = renderReviewFeedbackTemplate({
      templateId: "missing-criteria",
      values: {
        section: "3.2",
        gap: "rollback decision",
        requestedFix: "a pass/fail rollback signal",
      },
      sourceRef: {
        kind: "plan-section",
        target: "Plan.md",
        range: "L42-L49",
      },
    });

    expect(rendered.kind).toBe("missing-criteria");
    expect(rendered.fields).toEqual({
      section: "3.2",
      gap: "rollback decision",
      requestedFix: "a pass/fail rollback signal",
    });
    expect(rendered.text).toContain("Plan section 3.2 is missing acceptance criteria for rollback decision.");
    expect(rendered.text).toContain("Source: plan-section Plan.md:L42-L49");
  });

  test("editable template text wins before submit while preserving structured fields", () => {
    const rendered = renderReviewFeedbackTemplate({
      templateId: "test-gap",
      values: {
        behavior: "permission denial",
        coverage: "a router contract test",
      },
      editableText: "Add one denied-permission test at the router boundary.",
    });

    expect(rendered.text).toBe("Add one denied-permission test at the router boundary.");
    expect(rendered.fields).toEqual({
      behavior: "permission denial",
      coverage: "a router contract test",
    });
  });

  test("custom templates can be scoped by workspace or review type", () => {
    const workspaceTemplate = createCustomReviewFeedbackTemplate({
      id: "workspace-language-drift",
      label: "Workspace language drift",
      scope: "workspace",
      bodyTemplate: "Replace forbidden copy before approval.",
    });
    const uatTemplate = createCustomReviewFeedbackTemplate({
      id: "uat-visual-regression",
      label: "UAT visual regression",
      scope: "uat",
      bodyTemplate: "Visual regression is visible in {surface}.",
      fields: [{ name: "surface", label: "Surface", required: true }],
      kind: "prototype-mismatch",
    });

    const uatTemplates = listReviewFeedbackTemplates({
      scope: "uat",
      customTemplates: [workspaceTemplate, uatTemplate],
    });
    const codeReviewTemplates = listReviewFeedbackTemplates({
      scope: "code-review",
      customTemplates: [workspaceTemplate, uatTemplate],
    });

    expect(uatTemplates.map((template) => template.id)).toContain("workspace-language-drift");
    expect(uatTemplates.map((template) => template.id)).toContain("uat-visual-regression");
    expect(codeReviewTemplates.map((template) => template.id)).toContain("workspace-language-drift");
    expect(codeReviewTemplates.map((template) => template.id)).not.toContain("uat-visual-regression");
  });
});
