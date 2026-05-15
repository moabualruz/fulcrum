import { existsSync, readFileSync } from "fs";
import path from "path";

import {
  buildPlanFileRule,
  getPlanApprovedPrompt,
  getPlanApprovedWithNotesPrompt,
  getPlanDeniedPrompt,
  getPlanToolName,
  type PromptRuntime,
} from "@planning-review/application/planning-prompts.ts";
import {
  shouldRejectSubmitPlanForAgent,
  type NormalizedWorkflowOptions,
} from "@planning-review/application/planning-workflow.ts";

export interface PlanReviewRequest {
  content: string;
  sourceFilePath?: string;
}

export interface PlanReviewDecision {
  approved: boolean;
  feedback?: string;
  savedPath?: string;
  agentSwitch?: string;
}

export interface SubmitPlanForReviewInput {
  plan: string;
  invokingAgent?: string;
  workflowOptions: NormalizedWorkflowOptions;
  runtime?: PromptRuntime;
  reviewPlan: (request: PlanReviewRequest) => Promise<PlanReviewDecision>;
}

export function resolvePlanContent(plan: string): { content: string; filePath?: string } {
  if (isFilePath(plan)) {
    const content = readFileSync(plan, "utf-8");
    if (!content.trim()) {
      throw new Error(`Plan file at ${plan} is empty. Write your plan content first, then call submit_plan.`);
    }
    return { content, filePath: plan };
  }

  if (path.isAbsolute(plan) && plan.endsWith(".md")) {
    throw new Error(`File not found: ${plan}. Check the path and try again.`);
  }

  return { content: plan };
}

export function getPlanningPrompt(): string {
  return `## Plan Review

You have a plan submission tool called \`submit_plan\`. It opens an interactive review UI where the user can annotate, approve, or request changes.

**How to use it:**

- Pass your plan as markdown text - \`submit_plan(plan: "# My Plan\\n...")\`.
- Or pass an absolute file path to a .md file - \`submit_plan(plan: "/path/to/plan.md")\`.

The tool auto-detects whether you passed text or a file path. Both open the same review UI.

### Before you write a plan

Do not jump straight to writing a plan. First:

1. **Explore** - Read the relevant code, trace dependencies, and look at existing patterns. The depth should match the task.
2. **Ask questions** - If you need information only the user can provide (requirements, preferences, tradeoffs), ask using the \`question\` tool. Don't guess at ambiguous requirements.

Only write and submit a plan once you have sufficient context.

### What NOT to do

- Don't proceed with implementation until the plan is approved.
- Don't use \`plan_exit\` - use \`submit_plan\` instead.
- Don't end your turn without either submitting a plan or asking the user a question.`;
}

export async function submitPlanForReview(input: SubmitPlanForReviewInput): Promise<string> {
  const runtime = input.runtime ?? "opencode";
  if (shouldRejectSubmitPlanForAgent(input.invokingAgent, input.workflowOptions)) {
    return `Plan review is configured for plan-agent mode. submit_plan can only be called by: ${input.workflowOptions.planningAgents.join(", ")}.

Use /plan-last or /plan-annotate for manual review, or set workflow to all-agents to allow broader submit_plan access.`;
  }

  let planContent: string;
  let sourceFilePath: string | undefined;
  try {
    const resolved = resolvePlanContent(input.plan);
    planContent = resolved.content;
    sourceFilePath = resolved.filePath;
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }

  if (!planContent.trim()) {
    return "Error: Plan content is empty. Write your plan first, then call submit_plan.";
  }

  const result = await input.reviewPlan({ content: planContent, sourceFilePath });
  if (result.approved) {
    const shouldSwitchAgent = Boolean(result.agentSwitch && result.agentSwitch !== "disabled");
    if (result.feedback) {
      return getPlanApprovedWithNotesPrompt(runtime, {
        planFilePath: sourceFilePath,
        doneMsg: result.savedPath ? `Saved to: ${result.savedPath}` : "",
        feedback: result.feedback,
        proceedSuffix: shouldSwitchAgent ? "\n\nProceed with implementation, incorporating these notes where applicable." : "",
      });
    }

    return getPlanApprovedPrompt(runtime, {
      planFilePath: sourceFilePath,
      doneMsg: result.savedPath ? ` Saved to: ${result.savedPath}` : "",
    });
  }

  return `${getPlanDeniedPrompt(runtime, {
    toolName: getPlanToolName(runtime),
    planFileRule: buildPlanFileRule(getPlanToolName(runtime), sourceFilePath),
    feedback: result.feedback || "Plan changes requested",
  })}\n\nAfter making your revisions, call \`submit_plan\` again to resubmit for review.`;
}

function isFilePath(value: string): boolean {
  return path.isAbsolute(value) && value.endsWith(".md") && existsSync(value);
}
