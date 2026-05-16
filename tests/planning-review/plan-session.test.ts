import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

import {
  getPlanningPrompt,
  resolvePlanContent,
  submitPlanForReview,
  type PlanReviewRequest,
} from "@planning-review/application/plan-session.ts";
import { buildPlanFileRule, getPlanToolName } from "@planning-review/application/planning-prompts.ts";
import { normalizeWorkflowOptions } from "@planning-review/application/planning-workflow.ts";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "fulcrum-plan-review-session-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("review planning behavior behavior", () => {
  test("planning prompt tells agents to explore, ask, submit, and wait for approval", () => {
    const prompt = getPlanningPrompt();
    expect(prompt).toContain("submit_plan");
    expect(prompt).toContain("Explore");
    expect(prompt).toContain("Ask questions");
    expect(prompt).toContain("Don't proceed with implementation until the plan is approved.");
    expect(prompt).toContain("Don't use `plan_exit`");
  });

  test("resolves markdown text as plan content", () => {
    expect(resolvePlanContent("# Plan\n\nDo it.")).toEqual({ content: "# Plan\n\nDo it." });
  });

  test("resolves existing absolute markdown path and rejects missing or empty paths", () => {
    const dir = makeTempDir();
    const planPath = path.join(dir, "plan.md");
    writeFileSync(planPath, "# Path plan");

    expect(resolvePlanContent(planPath)).toEqual({ content: "# Path plan", filePath: planPath });
    expect(() => resolvePlanContent(path.join(dir, "missing.md"))).toThrow("File not found");

    const emptyPath = path.join(dir, "empty.md");
    writeFileSync(emptyPath, "  \n");
    expect(() => resolvePlanContent(emptyPath)).toThrow("is empty");
  });

  test("maps runtime to plan review plan tool names and file revision rule", () => {
    expect(getPlanToolName("opencode")).toBe("submit_plan");
    expect(getPlanToolName("codex")).toBe("ExitPlanMode");
    expect(buildPlanFileRule("submit_plan", "plans/auth.md")).toContain("pass its path to submit_plan");
    expect(buildPlanFileRule("submit_plan")).toBe("");
  });

  test("rejects submit_plan calls from non-planning agents in plan-agent workflow", async () => {
    const result = await submitPlanForReview({
      plan: "# Plan",
      invokingAgent: "build",
      workflowOptions: normalizeWorkflowOptions({ workflow: "plan-agent" }),
      reviewPlan: async () => {
        throw new Error("should not review");
      },
    });

    expect(result).toContain("submit_plan can only be called by: plan");
    expect(result).toContain("/plan-last");
  });

  test("returns approved prompt and passes plan content to review adapter", async () => {
    const requests: PlanReviewRequest[] = [];
    const result = await submitPlanForReview({
      plan: "# Approved plan",
      invokingAgent: "plan",
      workflowOptions: normalizeWorkflowOptions(undefined),
      reviewPlan: async (request) => {
        requests.push(request);
        return { approved: true, savedPath: "/tmp/saved.md" };
      },
    });

    expect(requests).toEqual([{ content: "# Approved plan", sourceFilePath: undefined }]);
    expect(result).toBe("Plan approved! Saved to: /tmp/saved.md");
  });

  test("returns approved-with-notes prompt including feedback and proceed suffix for agent switch", async () => {
    const result = await submitPlanForReview({
      plan: "# Plan",
      invokingAgent: "plan",
      workflowOptions: normalizeWorkflowOptions(undefined),
      reviewPlan: async () => ({
        approved: true,
        feedback: "Tighten migration sequence.",
        savedPath: "/tmp/saved.md",
        agentSwitch: "build",
      }),
    });

    expect(result).toContain("Plan approved with notes!");
    expect(result).toContain("Saved to: /tmp/saved.md");
    expect(result).toContain("Tighten migration sequence.");
    expect(result).toContain("Proceed with implementation");
  });

  test("returns denied prompt with feedback, plan file rule, and resubmit instruction", async () => {
    const dir = makeTempDir();
    const planPath = path.join(dir, "plan.md");
    writeFileSync(planPath, "# Denied plan");

    const result = await submitPlanForReview({
      plan: planPath,
      invokingAgent: "plan",
      workflowOptions: normalizeWorkflowOptions(undefined),
      reviewPlan: async () => ({
        approved: false,
        feedback: "Add success criteria.",
      }),
    });

    expect(result).toContain("YOUR PLAN WAS NOT APPROVED.");
    expect(result).toContain(`Your plan is saved at: ${planPath}`);
    expect(result).toContain("Add success criteria.");
    expect(result).toContain("call `submit_plan` again");
  });

  test("returns user-facing errors for empty text plans", async () => {
    const result = await submitPlanForReview({
      plan: " \n",
      invokingAgent: "plan",
      workflowOptions: normalizeWorkflowOptions(undefined),
      reviewPlan: async () => {
        throw new Error("should not review");
      },
    });

    expect(result).toBe("Error: Plan content is empty. Write your plan first, then call submit_plan.");
  });
});
