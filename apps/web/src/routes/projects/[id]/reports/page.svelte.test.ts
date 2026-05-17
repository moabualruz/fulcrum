import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const source = () => readFileSync(join(import.meta.dir, "+page.svelte"), "utf8");

describe("/projects/[id]/reports +page.svelte", () => {
  test("renders final QA trigger in reports", () => {
    const body = source();

    expect(body).toContain("data-final-qa-panel");
    expect(body).toContain('action="?/finalQa"');
    expect(body).toContain('action="?/finalQaGate"');
    expect(body).toContain('action="?/uatHandoff"');
    expect(body).toContain('action="?/uatDecision"');
    expect(body).toContain('action="?/autoDecision"');
    expect(body).toContain('action="?/e2eRun"');
    expect(body).toContain('action="?/reviewWorkbench"');
    expect(body).toContain('action="?/reviewSessionSave"');
    expect(body).toContain('action="?/reviewSessionLoad"');
    expect(body).toContain('action="?/reviewSessionAnnotate"');
    expect(body).toContain('name="traceId"');
    expect(body).toContain('name="filesJson"');
    expect(body).toContain('name="annotationsJson"');
    expect(body).toContain('name="reviewType"');
    expect(body).toContain('name="reviewerAgent"');
    expect(body).toContain('name="feedbackAgent"');
    expect(body).toContain('name="maxIterations"');
    expect(body).toContain('name="title"');
    expect(body).toContain('name="filePath"');
    expect(body).toContain('name="lineStart"');
    expect(body).toContain('name="lineEnd"');
    expect(body).toContain('name="annotationText"');
    expect(body).toContain('name="suggestedCode"');
    expect(body).toContain("Run Final QA");
    expect(body).toContain("Run QA Gate");
    expect(body).toContain("Prepare UAT");
    expect(body).toContain("Approve UAT");
    expect(body).toContain("Apply Auto Decision");
    expect(body).toContain("Run Generated E2E");
    expect(body).toContain("Build Review Workbench");
    expect(body).toContain("Save Review Session");
    expect(body).toContain("Load Review Session");
    expect(body).toContain("Add Annotation");
  });

  test("renders final QA report returned by the server action", () => {
    const body = source();

    expect(body).toContain("data-final-qa-result");
    expect(body).toContain("form.report.traceId");
    expect(body).toContain("form.report.nextAction");
    expect(body).toContain("form.report.checks");
    expect(body).toContain("check.details");
    expect(body).toContain("data-final-qa-gate-result");
    expect(body).toContain("form.gate.nextAction");
    expect(body).toContain("form.gate.feedbackLoop");
    expect(body).toContain("form.gate.finalQa.summary.openFeedbackRunCount");
    expect(body).toContain("data-uat-handoff-result");
    expect(body).toContain("form.handoff.nextAction");
    expect(body).toContain("form.handoff.reviewSessions");
    expect(body).toContain("data-uat-decision-result");
    expect(body).toContain("form.decision.generatedE2eTests");
    expect(body).toContain("generated.coverageCases");
    expect(body).toContain("generated.bodyPath");
    expect(body).toContain("data-auto-decision-result");
    expect(body).toContain("form.autoDecision.settingKey");
    expect(body).toContain("form.autoDecision.decision");
    expect(body).toContain("data-e2e-run-result");
    expect(body).toContain("form.e2eRun.status");
    expect(body).toContain("data-review-workbench-result");
    expect(body).toContain("form.reviewWorkbench.summary.searchMatchCount");
    expect(body).toContain("form.reviewWorkbench.visibleFiles");
    expect(body).toContain("form.reviewWorkbench.submission.targets");
    expect(body).toContain("form.reviewWorkbench.liveLog.displayText");
    expect(body).toContain("data-review-session-result");
    expect(body).toContain("form.reviewSession.status");
    expect(body).toContain("form.reviewSession.model.summary.searchMatchCount");
  });

  test("renders review workbench review editor workbench surfaces", () => {
    const body = source();

    expect(body).toContain("data-review-workbench-editor");
    expect(body).toContain("data-review-file-tree");
    expect(body).toContain("data-review-diff-pane");
    expect(body).toContain("data-review-sidebar");
    expect(body).toContain("data-review-sidebar-tab-annotations");
    expect(body).toContain("data-review-sidebar-tab-ai");
    expect(body).toContain("data-review-sidebar-tab-agents");
    expect(body).toContain("data-review-search-dock");
    expect(body).toContain("data-review-live-log-dock");
    expect(body).toContain("data-review-submission-dock");
    expect(body).toContain("data-review-feedback-export");
    expect(body).toContain("form.reviewWorkbench.fileTree");
    expect(body).toContain("form.reviewWorkbench.selectedFile");
    expect(body).toContain("form.reviewWorkbench.annotationGroups");
    expect(body).toContain("form.reviewWorkbench.search.groups");
    expect(body).toContain("form.reviewWorkbench.search.previousMatchId");
    expect(body).toContain("form.reviewWorkbench.search.nextMatchId");
    expect(body).toContain("form.reviewWorkbench.suggestions");
    expect(body).toContain("form.reviewWorkbench.feedbackMarkdown");
    expect(body).toContain("form.reviewWorkbench.submission.orphans");
  });

  test("renders loaded review sessions with the same review workbench workbench surfaces", () => {
    const body = source();

    expect(body).toContain("data-review-session-workbench");
    expect(body).toContain("data-review-session-file-tree");
    expect(body).toContain("data-review-session-diff-pane");
    expect(body).toContain("data-review-session-sidebar");
    expect(body).toContain("data-review-session-search-dock");
    expect(body).toContain("data-review-session-submission-dock");
    expect(body).toContain("data-review-session-live-log-dock");
    expect(body).toContain("form.reviewSession.model.fileTree");
    expect(body).toContain("form.reviewSession.model.selectedFile");
    expect(body).toContain("form.reviewSession.model.annotationGroups");
    expect(body).toContain("form.reviewSession.model.search.groups");
    expect(body).toContain("form.reviewSession.model.feedbackMarkdown");
    expect(body).toContain("form.reviewSession.model.submission.orphans");
  });
});
