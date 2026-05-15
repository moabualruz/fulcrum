export type PromptRuntime = "claude-code" | "opencode" | "copilot-cli" | "pi" | "codex" | "gemini-cli";

export const PLAN_TOOL_NAMES: Record<PromptRuntime, string> = {
  "claude-code": "ExitPlanMode",
  opencode: "submit_plan",
  "copilot-cli": "exit_plan_mode",
  pi: "submit_plan",
  codex: "ExitPlanMode",
  "gemini-cli": "exit_plan_mode",
};

export function resolveTemplate(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = vars[key];
    return value !== undefined ? value : match;
  });
}

export function getPlanToolName(runtime?: PromptRuntime | null): string {
  return (runtime && PLAN_TOOL_NAMES[runtime]) || "ExitPlanMode";
}

export function buildPlanFileRule(toolName: string, planFilePath?: string): string {
  if (!planFilePath) return "";
  return `- Your plan is saved at: ${planFilePath}\n  You can edit this file to make targeted changes, then pass its path to ${toolName}.\n`;
}

export const DEFAULT_PLAN_DENIED_PROMPT =
  "YOUR PLAN WAS NOT APPROVED.\n\nYou MUST revise the plan to address ALL of the feedback below before calling {{toolName}} again.\n\nRules:\n{{planFileRule}}- Do not resubmit the same plan unchanged.\n- Do NOT change the plan title (first # heading) unless the user explicitly asks you to.\n\n{{feedback}}";

export const DEFAULT_PLAN_APPROVED_PROMPT =
  "Plan approved. You now have full tool access (read, bash, edit, write). Execute the plan in {{planFilePath}}. {{doneMsg}}";

export const DEFAULT_PLAN_APPROVED_WITH_NOTES_PROMPT =
  "Plan approved with notes! You now have full tool access (read, bash, edit, write). Execute the plan in {{planFilePath}}. {{doneMsg}}\n\n## Implementation Notes\n\nThe user approved your plan but added the following notes to consider during implementation:\n\n{{feedback}}\n\nProceed with implementation, incorporating these notes where applicable.";

const PLAN_APPROVED_RUNTIME_DEFAULTS: Partial<Record<PromptRuntime, string>> = {
  opencode: "Plan approved!{{doneMsg}}",
};

const PLAN_APPROVED_WITH_NOTES_RUNTIME_DEFAULTS: Partial<Record<PromptRuntime, string>> = {
  opencode:
    "Plan approved with notes!\n{{doneMsg}}\n\n## Implementation Notes\n\nThe user approved your plan but added the following notes to consider during implementation:\n\n{{feedback}}{{proceedSuffix}}",
};

type FeedbackVars = Record<string, string | undefined>;

export function getPlanDeniedPrompt(runtime?: PromptRuntime | null, vars?: FeedbackVars): string {
  void runtime;
  return resolveTemplate(DEFAULT_PLAN_DENIED_PROMPT, vars ?? {});
}

export function getPlanApprovedPrompt(runtime?: PromptRuntime | null, vars?: FeedbackVars): string {
  const template = (runtime && PLAN_APPROVED_RUNTIME_DEFAULTS[runtime]) || DEFAULT_PLAN_APPROVED_PROMPT;
  return resolveTemplate(template, vars ?? {});
}

export function getPlanApprovedWithNotesPrompt(runtime?: PromptRuntime | null, vars?: FeedbackVars): string {
  const template = (runtime && PLAN_APPROVED_WITH_NOTES_RUNTIME_DEFAULTS[runtime]) || DEFAULT_PLAN_APPROVED_WITH_NOTES_PROMPT;
  return resolveTemplate(template, { proceedSuffix: "", ...vars });
}
