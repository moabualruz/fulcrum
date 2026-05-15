import { describe, expect, test } from "bun:test";

import { createTestOrm } from "@test-support/application-database.ts";
import { dispatchTaskRun } from "@execution-orchestration/application/runs/commands.ts";
import { createTask, setDependencies, updateTask } from "@work-management/application/work-item-commands.ts";
import { getTask } from "@work-management/application/work-item-queries.ts";
import { recordTaskQaReview } from "@execution-orchestration/application/qa-review-actions.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_ID = "99999999-9999-4999-8999-999999999999";

describe("review-orchestration QA review actions", () => {
  test("records a REVISE verdict against success criteria and schedules a feedback run", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      await em.getConnection().execute(
        `insert into projects (id, org_id, name) values (?, ?, ?)`,
        [PROJECT_ID, ORG_ID, "QA Review Project"],);
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      const task = await createTask(em, ctx, {
        title: "Ship dependency runner",
        status: "in_progress",
        projectId: PROJECT_ID,
        descriptionText: [
          "## Success Criteria",
          "- Dependency tree is disclosed before execution.",
          "- Feedback loops schedule corrective runs until review passes.",
        ].join("\n"),
      });
      const sourceRun = await dispatchTaskRun(em, ctx, {
        taskId: task.id,
        agent: "codex",
        model: "gpt-task",
        prompt: "Implement dependency runner",
      });
      await em.getConnection().execute(
        `update agent_runs set status = 'succeeded' where id = ?`,
        [sourceRun.id],);

      const result = await recordTaskQaReview(em, ctx, {
        taskId: task.id,
        runId: sourceRun.id,
        traceId: "trace-qa-review",
        reviewType: "code",
        reviewerAgent: "qa-reviewer",
        feedbackAgent: "codex",
        feedbackModel: "gpt-feedback",
        reviewText: [
          "## Code Review:",
          "### Verdict: REVISE",
          "The dependency disclosure works, but corrective feedback runs are not tied to success criteria.",
        ].join("\n"),
      });

      expect(result).toMatchObject({
        taskId: task.id,
        runId: sourceRun.id,
        traceId: "trace-qa-review",
        verdict: "REVISE",
        reviewType: "code",
        reviewerAgent: "qa-reviewer",
        nextAction: "feedback_run_scheduled",
      });
      expect(result.successCriteria.map((criterion) => criterion.text)).toEqual([
        "Dependency tree is disclosed before execution.",
        "Feedback loops schedule corrective runs until review passes.",
      ]);
      expect(result.feedbackRun).toMatchObject({
        taskId: task.id,
        agent: "codex",
        status: "queued",
      });
      expect(result.reviewFeed.items[0]).toMatchObject({
        reviewState: "REVISE",
        author: "reviewer-agent",
      });

      const taskAfterReview = await getTask(em, ctx, task.id);
      expect(taskAfterReview.status).toBe("in_progress");

      const eventRows = await em.getConnection().execute<Array<{ verb: string; payload: Record<string, unknown> }>>(
        `select verb, payload
           from events
          where subject_kind = 'task'
            and subject_id = ?
            and verb = 'qa_review_recorded'
          order by created_at asc`,
        [task.id],);
      expect(eventRows).toEqual([
        expect.objectContaining({
          verb: "qa_review_recorded",
          payload: expect.objectContaining({
            traceId: "trace-qa-review",
            verdict: "REVISE",
            nextAction: "feedback_run_scheduled",
            feedbackRunId: result.feedbackRun?.id,
            successCriteria: [
              "Dependency tree is disclosed before execution.",
              "Feedback loops schedule corrective runs until review passes.",
            ],
          }),
        }),
      ]);
    } finally {
      await db.close();
    }
  });

  test("blocks approval while dependencies are unresolved and marks resolved approvals ready for final review", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      await em.getConnection().execute(
        `insert into projects (id, org_id, name) values (?, ?, ?)`,
        [PROJECT_ID, ORG_ID, "QA Approval Project"],);
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      const dependency = await createTask(em, ctx, {
        title: "Provision database",
        status: "pending",
        projectId: PROJECT_ID,
      });
      const task = await createTask(em, ctx, {
        title: "Approve release task",
        status: "in_progress",
        projectId: PROJECT_ID,
        descriptionText: "## Success Criteria\n- Release task can pass final QA.",
      });
      em.clear();
      await setDependencies(em, ctx, task.id, {
        blocks: [],
        blocked_by: [dependency.id],
      });

      await expect(recordTaskQaReview(em, ctx, {
        taskId: task.id,
        traceId: "trace-qa-blocked",
        reviewType: "code",
        reviewerAgent: "qa-reviewer",
        reviewText: "### Verdict: APPROVE\nAll success criteria pass.",
      })).rejects.toThrow(/unresolved dependencies/i);

      await updateTask(em, ctx, dependency.id, { status: "completed" });
      const approved = await recordTaskQaReview(em, ctx, {
        taskId: task.id,
        traceId: "trace-qa-approved",
        reviewType: "code",
        reviewerAgent: "qa-reviewer",
        reviewText: "### Verdict: APPROVE\nAll success criteria pass.",
      });

      expect(approved).toMatchObject({
        taskId: task.id,
        verdict: "APPROVE",
        nextAction: "ready_for_final_review",
      });
      expect(approved.feedbackRun).toBeNull;

      const taskAfterApproval = await getTask(em, ctx, task.id);
      expect(taskAfterApproval.status).toBe("in_review");
    } finally {
      await db.close();
    }
  });
});
