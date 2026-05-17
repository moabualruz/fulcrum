import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = readFileSync(new URL("./+page.svelte", import.meta.url), "utf8");

describe("/projects/[id]/review +page.svelte source", () => {
  test("renders final QA report context before review/UAT decisions", () => {
    expect(source).toContain('data-testid="review-workbench-page"');
    expect(source).toContain("data-qa-report");
    expect(source).toContain("data.qaReport.status");
    expect(source).toContain("data.qaReport.nextAction");
    expect(source).toContain("data.qaReport.readyForUserAcceptance");
    expect(source).toContain("data.qaReport.traceId");
  });

  test("renders review workbench session lifecycle forms", () => {
    expect(source).toContain("data-start-review");
    expect(source).toContain('action="?/startReview"');
    expect(source).toContain("data-start-review-result");
    expect(source).toContain("ReviewWorkbench");
    expect(source).toContain("aiStreamUrl={`/api/review/stream?projectId=${data.projectId}`}");
    expect(source).toContain("data-review-sessions");
    expect(source).toContain('action="?/loadSession"');
    expect(source).toContain('action="?/saveSession"');
    expect(source).toContain("data-load-session-result");
    expect(source).toContain("data-save-session-result");
  });

  test("renders annotation and UAT decision controls backed by route actions", () => {
    expect(source).toContain('action="?/annotate"');
    expect(source).toContain('name="lineStart"');
    expect(source).toContain('name="lineEnd"');
    expect(source).toContain('name="severity"');
    expect(source).toContain('action="?/uatDecision"');
    expect(source).toContain('name="decision"');
    expect(source).toContain("approve_without_manual_review");
    expect(source).toContain("request_changes");
  });
});
