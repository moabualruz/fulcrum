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
});
