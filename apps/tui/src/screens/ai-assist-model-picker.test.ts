import { describe, expect, test } from "bun:test";

import { renderAiAssistAgentRoutes } from "./ai-assist-model-picker.ts";

describe("AI Assist agent routing screen", () => {
  test("renders executor validator planner agent choices with cascade source", () => {
    const output = renderAiAssistAgentRoutes([
      { role: "executor", agent: "codex", source: "task", tokenEstimate: 10820 },
      { role: "validator", agent: "claude-code", source: "project", tokenEstimate: 12480 },
      { role: "planner", agent: "gemini-cli", source: "global", tokenEstimate: 9340 },
    ]);

    expect(output).toContain("AI Assist");
    expect(output).toContain("Agent routing");
    expect(output).toContain("executor: codex [task] 10820 tokens");
    expect(output).toContain("validator: claude-code [project] 12480 tokens");
    expect(output).toContain("planner: gemini-cli [global] 9340 tokens");
    expect(output).toContain(":ai agents");
  });
});
