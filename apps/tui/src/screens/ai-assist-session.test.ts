import { describe, expect, test } from "bun:test";

import { renderTaskAiAssistStartScreen } from "./ai-assist-session.ts";

describe("AI Assist task session screen", () => {
  test("renders TUI start verb and assembled task context", () => {
    const output = renderTaskAiAssistStartScreen({
      task: { id: "task-3", title: "Wire task drawer", description: "Start from task row" },
      agent: "codex",
      route: "review",
      workspacePath: "/workspace/fulcrum",
    });

    expect(output).toContain("AI Assist");
    expect(output).toContain("Task: Wire task drawer");
    expect(output).toContain("Route: review");
    expect(output).toContain("Session: ai-task-3-review");
    expect(output).toContain(":ai start <task-id>");
  });
});
