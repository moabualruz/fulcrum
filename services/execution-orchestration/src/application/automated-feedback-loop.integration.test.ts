import { describe, expect, test } from "bun:test";

import { dispatchDependencyRunForTasks } from "@execution-orchestration/application/dependency-run-actions.ts";
import { runAutomatedFeedbackLoopForTasks } from "@execution-orchestration/application/automated-feedback-loop.ts";
import { createTask } from "@work-management/application/work-item-commands.ts";
import { getTask } from "@work-management/application/work-item-queries.ts";
import { createTestOrm } from "@test-support/application-database.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_ID = "99999999-9999-4999-8999-999999999999";

describe("execution orchestration automated feedback loop", () => {
  test("runs feedback tasks until QA approves and no queued feedback remains", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await em.getConnection().execute(
        `insert into projects (id, org_id, name) values (?, ?, ?)`,
        [PROJECT_ID, ORG_ID, "Automated Feedback Project"],);
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      const task = await createTask(em, ctx, {
        title: "Close automated review loop",
        status: "pending",
        projectId: PROJECT_ID,
        descriptionText: [
          "## Success Criteria",
          "- Feedback runs continue until QA approves.",
          "- Final feedback has no queued executor work.",
        ].join("\n"),
      });
      const dispatch = await dispatchDependencyRunForTasks(em, ctx, {
        mode: "task",
        targetTaskIds: [task.id],
        projectId: PROJECT_ID,
        traceId: "trace-feedback-loop",
        agent: "codex",
        model: "gpt-loop",
        prompt: "Implement loop",
      });

      const reviewInputs: string[] = [];
      const result = await runAutomatedFeedbackLoopForTasks(em, ctx, {
        projectId: PROJECT_ID,
        traceId: dispatch.runGroupId,
        reviewType: "code",
        feedbackAgent: "codex",
        feedbackModel: "gpt-feedback",
        maxIterations: 4,
      }, {
        runAgent: async (request) => ({
          transcript: `completed ${request.runId}\n`,
          exitCode: 0,
          filesChanged: [],
          artifacts: [],
          durationMs: 11,
          iterationCount: 1,
          exitReason: "complete",
          tokenUsed: 2,
        }),
        reviewTaskRun: async ({ tick }) => {
          reviewInputs.push(tick.processedRun?.id ?? "");
          return {
            reviewerAgent: "qa-reviewer",
            reviewText: reviewInputs.length === 1
              ? "### Verdict: REVISE\nFeedback runs are not proven against success criteria yet."
              : "### Verdict: APPROVE\nSuccess criteria pass and no more feedback is required.",
          };
        },
      });

      expect(result).toMatchObject({
        projectId: PROJECT_ID,
        traceId: "trace-feedback-loop",
        runGroupId: "trace-feedback-loop",
        iterations: 2,
        exhausted: true,
        stopReason: "automated_feedback_exhausted",
      });
      expect(result.processedRuns.map((run) => run.status)).toEqual(["succeeded", "succeeded"]);
      expect(result.reviews.map((review) => review.verdict)).toEqual(["REVISE", "APPROVE"]);
      expect(result.reviews[0]?.feedbackRun).toMatchObject({
        taskId: task.id,
        agent: "codex",
        status: "queued",
      });
      expect(result.feedback.executorStatus).toMatchObject({
        queuedTaskCount: 0,
        runningTaskCount: 0,
        succeededTaskCount: 2,
        failedTaskCount: 0,
        active: false,
      });
      expect(result.feedback.runs.map((run) => run.id)).toEqual(result.processedRuns.map((run) => run.id));

      const taskAfterLoop = await getTask(em, ctx, task.id);
      expect(taskAfterLoop.status).toBe("in_review");

      const eventRows = await em.getConnection().execute<Array<{ verb: string; payload: Record<string, unknown> }>>(
        `select verb, payload
           from events
          where project_id = ?
            and verb in ('qa_review_recorded', 'automated_feedback_loop_completed')
          order by created_at asc, id asc`,
        [PROJECT_ID],);
      expect(eventRows.map((row) => row.verb)).toEqual([
        "qa_review_recorded",
        "qa_review_recorded",
        "automated_feedback_loop_completed",
      ]);
      expect(eventRows.at(-1)?.payload).toMatchObject({
        traceId: "trace-feedback-loop",
        stopReason: "automated_feedback_exhausted",
        exhausted: true,
        iterations: 2,
      });
    } finally {
      await db.close();
    }
  });

  test("runs a default reviewer agent when no review callback is injected", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await em.getConnection().execute(
        `insert into projects (id, org_id, name) values (?, ?, ?)`,
        [PROJECT_ID, ORG_ID, "Default Reviewer Project"],);
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      const task = await createTask(em, ctx, {
        title: "Run live reviewer",
        status: "pending",
        projectId: PROJECT_ID,
        descriptionText: [
          "## Success Criteria",
          "- The live reviewer agent checks the completed task run.",
        ].join("\n"),
      });
      const dispatch = await dispatchDependencyRunForTasks(em, ctx, {
        mode: "task",
        targetTaskIds: [task.id],
        projectId: PROJECT_ID,
        traceId: "trace-default-reviewer",
        agent: "codex",
      });

      const reviewRequests: string[] = [];
      const result = await runAutomatedFeedbackLoopForTasks(em, ctx, {
        projectId: PROJECT_ID,
        traceId: dispatch.runGroupId,
        reviewerAgent: "codex",
        reviewType: "code",
        maxIterations: 2,
      }, {
        runAgent: async () => ({
          transcript: "implementation finished\n",
          exitCode: 0,
          filesChanged: [],
          artifacts: [],
          durationMs: 9,
          iterationCount: 1,
          exitReason: "complete",
        }),
        reviewAgent: async (request) => {
          reviewRequests.push(request.prompt);
          expect(request).toMatchObject({
            projectId: PROJECT_ID,
            taskId: task.id,
            traceId: "trace-default-reviewer",
            agent: "codex",
            queuePosition: 1,
          });
          expect(request.contextBundle).toMatchObject({
            projectId: PROJECT_ID,
            taskId: task.id,
            traceId: "trace-default-reviewer",
            processedRun: {
              taskId: task.id,
              status: "succeeded",
            },
          });
          return {
            transcript: "### Verdict: APPROVE\nThe completed run satisfies the task success criteria.",
            exitCode: 0,
            filesChanged: [],
            artifacts: [],
            durationMs: 7,
            iterationCount: 1,
            exitReason: "complete",
          };
        },
      });

      expect(result).toMatchObject({
        iterations: 1,
        exhausted: true,
        stopReason: "automated_feedback_exhausted",
      });
      expect(result.reviews.map((review) => review.verdict)).toEqual(["APPROVE"]);
      expect(result.reviews[0]?.reviewerAgent).toBe("codex");
      expect(reviewRequests).toHaveLength(1);
      expect(reviewRequests[0]).toContain("### Verdict: APPROVE");
      expect(reviewRequests[0]).toContain("The live reviewer agent checks the completed task run.");
    } finally {
      await db.close();
    }
  });

  test("stops without fabricating approval when no reviewer is available", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await em.getConnection().execute(
        `insert into projects (id, org_id, name) values (?, ?, ?)`,
        [PROJECT_ID, ORG_ID, "Reviewer Unavailable Project"],);
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      const task = await createTask(em, ctx, {
        title: "Require real review",
        status: "pending",
        projectId: PROJECT_ID,
      });
      const dispatch = await dispatchDependencyRunForTasks(em, ctx, {
        mode: "task",
        targetTaskIds: [task.id],
        projectId: PROJECT_ID,
        traceId: "trace-reviewer-unavailable",
        agent: "codex",
      });

      const result = await runAutomatedFeedbackLoopForTasks(em, ctx, {
        projectId: PROJECT_ID,
        traceId: dispatch.runGroupId,
        maxIterations: 2,
      }, {
        runAgent: async () => ({
          transcript: "implementation finished\n",
          exitCode: 0,
          filesChanged: [],
          artifacts: [],
          durationMs: 9,
          iterationCount: 1,
          exitReason: "complete",
        }),
        reviewAgent: async () => ({
          transcript: "",
          exitCode: 0,
          filesChanged: [],
          artifacts: [],
          durationMs: 1,
          iterationCount: 1,
          exitReason: "complete",
        }),
      });

      expect(result.stopReason).toBe("reviewer_unavailable");
      expect(result.exhausted).toBe(false);
      expect(result.processedRuns).toHaveLength(1);
      expect(result.reviews).toEqual([]);

      const reviewRows = await em.getConnection().execute<Array<{ id: string }>>(
        `select id from events where project_id = ? and verb = 'qa_review_recorded'`,
        [PROJECT_ID],);
      expect(reviewRows).toEqual([]);
    } finally {
      await db.close();
    }
  });

  test("caps automated feedback when reviews keep scheduling corrective runs", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await em.getConnection().execute(
        `insert into projects (id, org_id, name) values (?, ?, ?)`,
        [PROJECT_ID, ORG_ID, "Feedback Cap Project"],);
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      const task = await createTask(em, ctx, {
        title: "Hit feedback cap",
        status: "pending",
        projectId: PROJECT_ID,
      });
      const dispatch = await dispatchDependencyRunForTasks(em, ctx, {
        mode: "task",
        targetTaskIds: [task.id],
        projectId: PROJECT_ID,
        traceId: "trace-feedback-cap",
        agent: "codex",
      });

      const result = await runAutomatedFeedbackLoopForTasks(em, ctx, {
        projectId: PROJECT_ID,
        traceId: dispatch.runGroupId,
        maxIterations: 1,
      }, {
        runAgent: async () => ({
          transcript: "attempted fix\n",
          exitCode: 0,
          filesChanged: [],
          artifacts: [],
          durationMs: 10,
          iterationCount: 1,
          exitReason: "complete",
        }),
        reviewTaskRun: async () => ({
          reviewText: "### Verdict: REVISE\nStill needs another corrective run.",
        }),
      });

      expect(result).toMatchObject({
        iterations: 1,
        exhausted: false,
        stopReason: "max_iterations_reached",
      });
      expect(result.reviews.map((review) => review.verdict)).toEqual(["REVISE"]);
      expect(result.feedback.executorStatus).toMatchObject({
        queuedTaskCount: 1,
        active: true,
      });
    } finally {
      await db.close();
    }
  });
});
