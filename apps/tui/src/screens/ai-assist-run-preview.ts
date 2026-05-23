export interface TuiAiAssistRunPreview {
  prompt: string;
  scope: readonly string[];
  tools: readonly string[];
  gates: readonly string[];
  cost: string;
}

export function renderAiAssistRunPreview(preview: TuiAiAssistRunPreview): string {
  return [
    "AI Assist",
    "Preview before dispatch",
    "",
    `PROMPT.md: ${preview.prompt}`,
    `scope: ${preview.scope.join(", ")}`,
    `tools: ${preview.tools.join(", ")}`,
    `gates: ${preview.gates.join(", ")}`,
    `agent cost: ${preview.cost}`,
    "",
    "Enter confirm and dispatch  e edit  Esc back",
  ].join("\n");
}
