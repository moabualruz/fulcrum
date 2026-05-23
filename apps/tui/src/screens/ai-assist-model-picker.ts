export interface TuiAiAssistAgentRoute {
  role: "executor" | "validator" | "planner";
  agent: string;
  source: "task" | "project" | "global";
  tokenEstimate: number;
}

export function renderAiAssistAgentRoutes(routes: readonly TuiAiAssistAgentRoute[]): string {
  const lines = [
    "AI Assist",
    "Agent routing",
    "",
  ];

  for (const route of routes) {
    lines.push(`${route.role}: ${route.agent} [${route.source}] ${route.tokenEstimate} tokens`);
  }

  lines.push("", ":ai agents  Enter change agent  s save  Esc back");
  return lines.join("\n");
}
