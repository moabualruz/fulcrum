import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = readFileSync(new URL("./+page.svelte", import.meta.url), "utf8");

describe("/projects/[id]/uat +page.svelte source", () => {
  test("renders UAT handoff status and trace context", () => {
    expect(source).toContain('data-testid="uat-page"');
    expect(source).toContain("data-uat-status");
    expect(source).toContain("data.handoff.status");
    expect(source).toContain("data.handoff.finalQaStatus");
    expect(source).toContain("data.handoff.nextAction");
    expect(source).toContain("data.handoff.traceId");
  });

  test("renders approval and feedback decision controls", () => {
    expect(source).toContain("data-uat-decision");
    expect(source).toContain('action="?/decide"');
    expect(source).toContain('name="decision"');
    expect(source).toContain('name="feedbackText"');
    expect(source).toContain("approve_without_manual_review");
    expect(source).toContain("request_changes");
    expect(source).toContain("start_uat");
    expect(source).toContain("Start Code Review");
  });

  test("renders decision result and handoff prompt preview", () => {
    expect(source).toContain("data-uat-result");
    expect(source).toContain("form.decision.status");
    expect(source).toContain("form.decision.decision");
    expect(source).toContain("form.decision.nextAction");
    expect(source).toContain("data-uat-prompt");
    expect(source).toContain("data.handoff.promptMarkdown");
  });
});
