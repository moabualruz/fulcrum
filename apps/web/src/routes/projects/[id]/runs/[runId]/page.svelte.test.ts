import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = readFileSync(new URL("./+page.svelte", import.meta.url), "utf8");

describe("/projects/[id]/runs/[runId] +page.svelte source", () => {
  test("renders run detail header, metadata, and control actions", () => {
    expect(source).toContain("data-project-run-detail-header");
    expect(source).toContain("data-back-project-runs");
    expect(source).toContain("RunStatusBadge");
    expect(source).toContain("data-symphony-badge");
    expect(source).toContain("data-run-meta");
    expect(source).toContain("data-runs-cancel-trigger");
    expect(source).toContain("data-runs-retry-trigger");
    expect(source).toContain('action="?/cancel"');
    expect(source).toContain('action="?/retry"');
  });

  test("renders transcript, payload, and event tabs for dependency run feedback", () => {
    expect(source).toContain("data-runs-tabs");
    expect(source).toContain('data-tab="transcript"');
    expect(source).toContain('data-tab="payload"');
    expect(source).toContain('data-tab="events"');
    expect(source).toContain('data-runs-tabpanel="transcript"');
    expect(source).toContain("data-runs-transcript");
    expect(source).toContain("data-runs-payload");
    expect(source).toContain("data-runs-events");
    expect(source).toContain("event.verb");
    expect(source).toContain("event.created_at");
  });

  test("renders AI Assist live session timeline controls", () => {
    expect(source).toContain("data-ai-assist-live-session");
    expect(source).toContain("AI Assist live session");
    expect(source).toContain("data-live-autoscroll-toggle");
    expect(source).toContain("data-live-session-disconnect");
    expect(source).toContain("data-tool-call-timeline");
    expect(source).toContain("data-tool-call-card");
    expect(source).toContain("data-tool-args-summary");
    expect(source).toContain("data-tool-result-status");
    expect(source).toContain("data-tool-output-copy");
    expect(source).toContain("data-diff-preview");
    expect(source).toContain("data-approval-gate");
    expect(source).toContain("navigator.clipboard.writeText");
  });

  test("renders approval queue with decision actions", () => {
    expect(source).toContain("data-approval-queue-pane");
    expect(source).toContain("Approval Queue");
    expect(source).toContain("data-approval-risk-level");
    expect(source).toContain("data-approval-arguments");
    expect(source).toContain("data-approval-context");
    expect(source).toContain('action="?/approvalDecision"');
    expect(source).toContain("data-approval-approve");
    expect(source).toContain("data-approval-deny");
    expect(source).toContain("data-approval-request-info");
  });
});
