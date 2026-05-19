export interface TuiAiAssistPromptEdit {
  before: string;
  after: string;
  runAttempt: string;
}

export function renderAiAssistPromptEdit(edit: TuiAiAssistPromptEdit): string {
  return [
    "AI Assist",
    "Prompt edit",
    "",
    `before: ${edit.before}`,
    `after: ${edit.after}`,
    `attempt: ${edit.runAttempt}`,
    "",
    "Enter re-run from this prompt  Esc cancel",
  ].join("\n");
}
