import { describe, expect, test } from "bun:test";

import { Renderer } from "@fulcrum/tui/renderer.ts";
import { PlanningBreakdownScreen } from "@fulcrum/tui/screens/planning-breakdown.ts";
import { FakeTTY } from "@fulcrum/tui/testing/fake-tty.ts";

function renderPlain(screen: PlanningBreakdownScreen): string {
  const tty = new FakeTTY({ columns: 120, rows: 40 });
  screen.render(new Renderer(tty));
  return tty.plainText();
}

describe("TUI AI Assist visible copy", () => {
  test("guided planning output uses AI Assist language", async () => {
    const screen = new PlanningBreakdownScreen({
      input: {
        planId: "plan_1",
        approvedPlanMarkdown: "# Plan",
        traceId: "trace_1",
      },
      guidedAcpInput: {
        acpSessionId: "acp-guided-tui",
        agentName: "codex",
        cwd: "/repo",
        userPrompt: "Plan with selected context.",
      },
      caller: {
        planning: {
          previewApprovedPlanBreakdown: async () => ({
            title: "Approved Plan",
            taskDrafts: [],
          }),
          startGuidedAcpPlanningSession: async () => ({
            status: "ready_for_acp_prompt",
            session: {
              acpSessionId: "acp-guided-tui",
              agentName: "codex",
              cwd: "/repo",
              modeId: "planning",
              modelId: "gpt-5.5",
              permissionMode: "review_each_tool",
            },
            context: { sourceRefs: [{ kind: "doc", id: "doc_1" }] },
            traffic: { entries: [{ method: "session/new" }] },
            prompt: "Use the planning session with submit_plan",
          }),
        },
      },
    });

    await screen.load();
    await screen.handleKey("a");

    const text = renderPlain(screen);
    expect(text).toContain("AI Assist session");
    expect(text).not.toContain("ACP");
  });
});
