import { describe, expect, test } from "bun:test";

import { Renderer } from "../renderer.ts";
import { TaskListScreen } from "../screens/task-list.ts";
import { FakeTTY } from "../testing/fake-tty.ts";
import type { TaskQaReviewOutput } from "@execution-orchestration/application/qa-review-actions.ts";

const QA_REVIEW: TaskQaReviewOutput = {
  taskId: "task-release",
  runId: "run-release",
  traceId: "trace-tui-qa",
  reviewType: "code",
  reviewerAgent: "qa-reviewer",
  verdict: "REVISE",
  nextAction: "feedback_run_scheduled",
  successCriteria: [{ id: "criterion-1", text: "Dependency disclosure is verified." }],
  feedbackRun: {
    id: "run-feedback",
    taskId: "task-release",
    agent: "codex",
    status: "queued",
  },
  recoveryPlan: null,
  reviewFeed: {
    mode: "reviewer-agent",
    refreshable: true,
    fetchedAt: "2026-05-13T00:00:00.000Z",
    summary: { verdict: "REVISE", summary: "code review REVISE" },
    items: [{
      itemId: "reviewer-code-step-na-revise-2026-05-13T00-00-00-000Z-1",
      sourceMode: "reviewer-agent",
      title: "code review REVISE",
      body: "### Verdict: REVISE\nFix final QA.",
      author: "reviewer-agent",
      createdAt: "2026-05-13T00:00:00.000Z",
      updatedAt: "2026-05-13T00:00:00.000Z",
      reviewState: "REVISE",
      progressStatus: null,
    }],
  },
};

describe("TUI QA review workflow", () => {
  test("task list records QA reviews through the caller and renders feedback run status", async () => {
    const calls: unknown[] = [];
    const screen = new TaskListScreen({
      caller: {
        tasks: {
          list: async () => [{
            id: "task-release",
            title: "Release dependency runner",
            status: "in_progress",
            assignee: "agent",
            labels: ["qa"],
          }],
          recordQaReview: async (input) => {
            calls.push(input);
            return QA_REVIEW;
          },
        },
      },
      qaReviewInput: {
        runId: "run-release",
        traceId: "trace-tui-qa",
        reviewType: "code",
        reviewerAgent: "qa-reviewer",
        feedbackAgent: "codex",
        reviewText: "### Verdict: REVISE\nFix final QA.",
      },
    });

    await screen.load();
    expect(await screen.handleKey("Q")).toBe(true);

    expect(calls).toEqual([{
      taskId: "task-release",
      runId: "run-release",
      traceId: "trace-tui-qa",
      reviewType: "code",
      reviewerAgent: "qa-reviewer",
      feedbackAgent: "codex",
      reviewText: "### Verdict: REVISE\nFix final QA.",
    }]);

    const tty = new FakeTTY({ columns: 100, rows: 30 });
    const renderer = new Renderer(tty);
    screen.render(renderer);
    const text = tty.plainText();
    expect(text).toContain("QA review recorded");
    expect(text).toContain("Verdict: REVISE");
    expect(text).toContain("Next: feedback_run_scheduled");
    expect(text).toContain("feedback run-feedback task:task-release agent:codex status:queued");
    expect(text).toContain("Dependency disclosure is verified.");
  });
});
