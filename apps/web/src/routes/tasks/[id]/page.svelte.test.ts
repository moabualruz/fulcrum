import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = readFileSync(new URL("./+page.svelte", import.meta.url), "utf8");

describe("/tasks/[id] +page.svelte source", () => {
  test("renders task-level dependency run controls and graph results", () => {
    expect(source).toContain("data-task-run-controls");
    expect(source).toContain('action="?/runPreview"');
    expect(source).toContain('action="?/run"');
    expect(source).toContain('action="?/runFeedback"');
    expect(source).toContain("data-task-dependency-graph");
    expect(source).toContain("data-task-dependency-node");
    expect(source).toContain("data-task-run-feedback");
    expect(source).toContain("data-task-run-feedback-live");
    expect(source).toContain("new EventSource");
    expect(source).toContain("run-feedback?");
    expect(source).toContain("displayedRunFeedback.executorStatus");
    expect(source).toContain("displayedRunFeedback.events");
    expect(source).toContain("form.preview.orderedTaskIds");
    expect(source).toContain("form.dispatch.scheduledRuns");
    expect(source).toContain("form.dispatch.skippedTasks");
  });

  test("renders task-scoped AI Assist drawer controls", () => {
    expect(source).toContain("data-task-ai-assist-open");
    expect(source).toContain("Start AI Assist");
    expect(source).toContain("data-ai-assist-drawer");
    expect(source).toContain("data-ai-assist-agent-picker");
    expect(source).toContain("data-ai-assist-route-selector");
    expect(source).toContain("data-ai-assist-workspace-path");
    expect(source).toContain("data-ai-assist-context-bundle");
    expect(source).toContain("data-context-doc");
    expect(source).toContain("data-context-memory");
    expect(source).toContain("data-context-repo");
    expect(source).toContain('action="?/startAiAssistSession"');
    expect(source).toContain("data-ai-assist-session-created");
    expect(source).not.toContain(">ACP<");
  });
});
