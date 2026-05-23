import { describe, expect, test } from "bun:test";

import { renderAiAssistRunPreview } from "./ai-assist-run-preview.ts";

describe("AI Assist run preview screen", () => {
  test("renders prompt scope tools gates and cost before dispatch", () => {
    const output = renderAiAssistRunPreview({
      prompt: "Draft plan.",
      scope: ["apps/web/**"],
      tools: ["read", "bun test"],
      gates: ["ask before writes"],
      cost: "$0.43",
    });

    expect(output).toContain("Preview before dispatch");
    expect(output).toContain("PROMPT.md: Draft plan.");
    expect(output).toContain("scope: apps/web/**");
    expect(output).toContain("tools: read, bun test");
    expect(output).toContain("gates: ask before writes");
    expect(output).toContain("agent cost: $0.43");
    expect(output).toContain("confirm and dispatch");
  });
});
