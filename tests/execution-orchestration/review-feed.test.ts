import { describe, expect, test } from "bun:test";

import {
  EMPTY_REVIEW_FEEDBACK_MESSAGE,
  buildDirectTaskReviewData,
} from "@execution-orchestration/domain/review-feed.ts";

const TASK_UPDATED_AT = "2026-05-01T00:00:00.000Z";

describe("dependency orchestration review feed extraction", () => {
  test("normalizes reviewer-agent blocks from text logs", () => {
    const reviewData = buildDirectTaskReviewData({
      task: {
        id: "FN-001",
        updatedAt: TASK_UPDATED_AT,
        log: [{ timestamp: "2026-05-01T10:00:00.000Z", action: "code review Step 2: REVISE" }],
      },
      agentLogs: [
        {
          timestamp: "2026-05-01T10:00:01.000Z",
          taskId: "FN-001",
          type: "text",
          agent: "reviewer",
          text: "## Code Review:\n\n### Verdict: REVISE\n\n### Summary\nNeeds guard\n",
        },
      ],
      fetchedAt: "2026-05-01T10:01:00.000Z",
    });

    expect(reviewData.mode).toBe("reviewer-agent");
    expect(reviewData.refreshable).toBe(true);
    expect(reviewData.fetchedAt).toBe("2026-05-01T10:01:00.000Z");
    expect(reviewData.summary).toEqual({ summary: "code review REVISE", verdict: "REVISE" });
    expect(reviewData.items).toHaveLength(1);
    expect(reviewData.items[0]).toMatchObject({
      sourceMode: "reviewer-agent",
      title: "code review REVISE",
      body: "## Code Review:\n\n### Verdict: REVISE\n\n### Summary\nNeeds guard",
      author: "reviewer-agent",
      createdAt: "2026-05-01T10:00:00.000Z",
      updatedAt: "2026-05-01T10:00:00.000Z",
      reviewState: "REVISE",
      progressStatus: null,
    });
    expect(reviewData.items[0]?.itemId).toBe("reviewer-code-step-na-revise-2026-05-01T10-00-00-000Z-1");
  });

  test("returns exact empty direct-mode payload when no reviewer feedback exists", () => {
    const reviewData = buildDirectTaskReviewData({
      task: { id: "FN-001", updatedAt: TASK_UPDATED_AT, log: [] },
      agentLogs: [],
      fetchedAt: "2026-05-01T10:01:00.000Z",
    });

    expect(reviewData).toEqual({
      mode: "reviewer-agent",
      refreshable: true,
      fetchedAt: "2026-05-01T10:01:00.000Z",
      summary: null,
      items: [],
    });
    expect(EMPTY_REVIEW_FEEDBACK_MESSAGE).toBe(
      "No reviewer feedback yet - this task has not produced reviewer-agent feedback in direct mode.",
    );
  });

  test("falls back to task log summaries when reviewer output has no complete review blocks", () => {
    const reviewData = buildDirectTaskReviewData({
      task: {
        id: "FN-001",
        updatedAt: TASK_UPDATED_AT,
        log: [{ timestamp: "2026-05-01T10:00:00.000Z", action: "plan review Step 1: APPROVE" }],
      },
      agentLogs: [
        {
          timestamp: "2026-05-01T10:00:01.000Z",
          taskId: "FN-001",
          type: "text",
          agent: "reviewer",
          text: "partial",
        },
      ],
      fetchedAt: "2026-05-01T10:01:00.000Z",
    });

    expect(reviewData.items[0]).toMatchObject({
      title: "plan review APPROVE",
      body: "plan review Step 1: APPROVE",
      createdAt: "2026-05-01T10:00:00.000Z",
      reviewState: "APPROVE",
    });
    expect(reviewData.summary).toEqual({ summary: "plan review APPROVE", verdict: "APPROVE" });
  });

  test("sorts newest review items first and ignores non-reviewer or non-text logs", () => {
    const reviewData = buildDirectTaskReviewData({
      task: {
        id: "FN-001",
        updatedAt: TASK_UPDATED_AT,
        log: [
          { timestamp: "2026-05-01T10:00:00.000Z", action: "code review Step 1: APPROVE" },
          { timestamp: "2026-05-01T11:00:00.000Z", action: "plan review Step 2: RETHINK" },
        ],
      },
      agentLogs: [
        { timestamp: "ignore", taskId: "FN-001", type: "text", agent: "worker", text: "## Code Review:\n### Verdict: REVISE" },
        { timestamp: "ignore", taskId: "FN-001", type: "tool", agent: "reviewer", text: "## Code Review:\n### Verdict: REVISE" },
        {
          timestamp: "2026-05-01T10:00:01.000Z",
          taskId: "FN-001",
          type: "text",
          agent: "reviewer",
          text: [
            "## Code Review:",
            "",
            "### Verdict: APPROVE",
            "",
            "## Plan Review:",
            "",
            "### Verdict: RETHINK",
          ].join("\n"),
        },
      ],
      fetchedAt: "2026-05-01T12:00:00.000Z",
    });

    expect(reviewData.items.map((item) => item.title)).toEqual([
      "plan review RETHINK",
      "code review APPROVE",
    ]);
    expect(reviewData.summary).toEqual({ summary: "plan review RETHINK", verdict: "RETHINK" });
  });
});
