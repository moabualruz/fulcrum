import { describe, expect, test } from "bun:test";

import { renderAiAssistPromptEdit } from "./ai-assist-session-prompt-edit.ts";

describe("AI Assist prompt edit screen", () => {
  test("renders inline edit provenance and re-run action", () => {
    const output = renderAiAssistPromptEdit({
      before: "Draft a plan.",
      after: "Draft a plan with risks.",
      runAttempt: "run_attempt_1",
    });

    expect(output).toContain("AI Assist");
    expect(output).toContain("Prompt edit");
    expect(output).toContain("before: Draft a plan.");
    expect(output).toContain("after: Draft a plan with risks.");
    expect(output).toContain("attempt: run_attempt_1");
    expect(output).toContain("re-run from this prompt");
  });
});
