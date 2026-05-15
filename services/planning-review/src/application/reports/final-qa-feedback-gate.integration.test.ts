import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { dispatchTaskRun } from "@execution-orchestration/application/runs/commands.ts";
import { createTask } from "@work-management/application/work-item-commands.ts";
import { recordTaskQaReview } from "@execution-orchestration/application/qa-review-actions.ts";
import { createTestOrm } from "@test-support/application-database.ts";
import { buildFinalQaFeedbackGate } from "@planning-review/application/reports/final-qa-feedback-gate.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_ID = "99999999-9999-4999-8999-999999999999";

describe("review orchestration final QA feedback gate", () => {
  test("runs automated feedback before final QA handoff and returns a passed final report", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      await seedProject(em);
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      await seedProjectDoc(em, {
        title: "Accepted feedback gate plan",
        body: "Trace trace-feedback-gate-ready verifies the automated feedback loop before handoff.",
      });
      const task = await createTask(em, ctx, {
        title: "Close final QA feedback gate",
        status: "in_progress",
        projectId: PROJECT_ID,
        descriptionText: [
          "## Success Criteria",
          "- Final QA runs feedback before handoff.",
          "- User handoff waits until feedback is exhausted.",
        ].join("\n"),
      });
      const run = await dispatchTaskRun(em, ctx, {
        taskId: task.id,
        agent: "codex",
        prompt: "Build final QA feedback gate",
      });
      await em.getConnection().execute("update agent_runs set status = 'succeeded' where id = ?", [run.id]);
      await seedArtifact(em, { runId: run.id, taskId: task.id });
      await recordTaskQaReview(em, ctx, {
        taskId: task.id,
        runId: run.id,
        traceId: "trace-feedback-gate-ready",
        reviewType: "code",
        reviewerAgent: "qa-reviewer",
        feedbackAgent: "codex",
        reviewText: "### Verdict: REVISE\nFinal QA must prove the loop closes before handoff.",
      });

      const result = await buildFinalQaFeedbackGate(em, ctx, {
        projectId: PROJECT_ID,
        traceId: "trace-feedback-gate-ready",
        maxIterations: 3,
      }, {
        runAgent: async (request) => ({
          transcript: `completed feedback run ${request.runId}\n`,
          exitCode: 0,
          filesChanged: [],
          artifacts: [],
          durationMs: 12,
          iterationCount: 1,
          exitReason: "complete",
          tokenUsed: 2,
        }),
        reviewTaskRun: async () => ({
          reviewerAgent: "qa-reviewer",
          reviewText: "### Verdict: APPROVE\nFeedback is exhausted and success criteria are met.",
        }),
      });

      expect(result).toMatchObject({
        projectId: PROJECT_ID,
        traceId: "trace-feedback-gate-ready",
        loopAttempted: true,
        readyForUserAcceptance: true,
        nextAction: "prompt_uat_code_review",
      });
      expect(result.initialFinalQa).toMatchObject({
        status: "failed",
        nextAction: "continue_automated_feedback",
      });
      expect(result.feedbackLoop).toMatchObject({
        exhausted: true,
        stopReason: "automated_feedback_exhausted",
      });
      expect(result.finalQa).toMatchObject({
        status: "passed",
        readyForUserAcceptance: true,
        nextAction: "prompt_uat_code_review",
      });
      expect(result.finalQa.summary.openFeedbackRunCount).toBe(0);
      expect(result.finalQa.taskResults[0]).toMatchObject({
        taskId: task.id,
        latestVerdict: "APPROVE",
      });

      const events = await em.getConnection().execute<Array<{ verb: string; payload: Record<string, unknown> }>>(
        `select verb, payload
           from events
          where project_id = ?
            and verb = 'final_qa_feedback_gate_completed'
          order by created_at asc, id asc`,
        [PROJECT_ID],
      );
      expect(events).toEqual([
        expect.objectContaining({
          verb: "final_qa_feedback_gate_completed",
          payload: expect.objectContaining({
            traceId: "trace-feedback-gate-ready",
            loopAttempted: true,
            loopStopReason: "automated_feedback_exhausted",
            initialNextAction: "continue_automated_feedback",
            finalNextAction: "prompt_uat_code_review",
            readyForUserAcceptance: true,
          }),
        }),
      ]);
    } finally {
      await db.close();
    }
  });

  test("blocks handoff when feedback cannot be reviewed truthfully", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      await seedProject(em);
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      await seedProjectDoc(em, {
        title: "Blocked feedback gate plan",
        body: "Trace trace-feedback-gate-blocked needs a real reviewer.",
      });
      const task = await createTask(em, ctx, {
        title: "Require real feedback review",
        status: "in_progress",
        projectId: PROJECT_ID,
        descriptionText: "## Success Criteria\n- Reviews are never fabricated.",
      });
      const run = await dispatchTaskRun(em, ctx, {
        taskId: task.id,
        agent: "codex",
        prompt: "Require real review",
      });
      await em.getConnection().execute("update agent_runs set status = 'succeeded' where id = ?", [run.id]);
      await seedArtifact(em, { runId: run.id, taskId: task.id });
      await recordTaskQaReview(em, ctx, {
        taskId: task.id,
        runId: run.id,
        traceId: "trace-feedback-gate-blocked",
        reviewType: "code",
        reviewerAgent: "qa-reviewer",
        feedbackAgent: "codex",
        reviewText: "### Verdict: REVISE\nNeeds another implementation pass.",
      });

      const result = await buildFinalQaFeedbackGate(em, ctx, {
        projectId: PROJECT_ID,
        traceId: "trace-feedback-gate-blocked",
        maxIterations: 2,
      }, {
        runAgent: async () => ({
          transcript: "implementation pass completed\n",
          exitCode: 0,
          filesChanged: [],
          artifacts: [],
          durationMs: 10,
          iterationCount: 1,
          exitReason: "complete",
        }),
      });

      expect(result).toMatchObject({
        loopAttempted: true,
        readyForUserAcceptance: false,
        nextAction: "continue_automated_feedback",
      });
      expect(result.feedbackLoop).toMatchObject({
        exhausted: false,
        stopReason: "reviewer_unavailable",
      });
      expect(result.finalQa).toMatchObject({
        status: "failed",
        readyForUserAcceptance: false,
        nextAction: "continue_automated_feedback",
      });

      const qaEvents = await em.getConnection().execute<Array<{ payload: Record<string, unknown> }>>(
        `select payload
           from events
          where project_id = ?
            and verb = 'qa_review_recorded'
          order by created_at asc, id asc`,
        [PROJECT_ID],
      );
      expect(qaEvents.map((event) => event.payload.verdict)).toEqual(["REVISE"]);
    } finally {
      await db.close();
    }
  });

  test("skips the loop when final QA is already ready for handoff", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      await seedProject(em);
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      await seedProjectDoc(em, {
        title: "Ready plan",
        body: "Trace trace-feedback-gate-skip is already approved.",
      });
      const task = await createTask(em, ctx, {
        title: "Already ready",
        status: "in_progress",
        projectId: PROJECT_ID,
        descriptionText: "## Success Criteria\n- Already approved work stays ready.",
      });
      const run = await dispatchTaskRun(em, ctx, {
        taskId: task.id,
        agent: "codex",
        prompt: "Already ready",
      });
      await em.getConnection().execute("update agent_runs set status = 'succeeded' where id = ?", [run.id]);
      await seedArtifact(em, { runId: run.id, taskId: task.id });
      await recordTaskQaReview(em, ctx, {
        taskId: task.id,
        runId: run.id,
        traceId: "trace-feedback-gate-skip",
        reviewType: "code",
        reviewerAgent: "qa-reviewer",
        reviewText: "### Verdict: APPROVE\nReady.",
      });

      let called = false;
      const result = await buildFinalQaFeedbackGate(em, ctx, {
        projectId: PROJECT_ID,
        traceId: "trace-feedback-gate-skip",
      }, {
        runAgent: async () => {
          called = true;
          throw new Error("loop should not run");
        },
      });

      expect(called).toBe(false);
      expect(result).toMatchObject({
        loopAttempted: false,
        feedbackLoop: null,
        readyForUserAcceptance: true,
        nextAction: "prompt_uat_code_review",
      });
      expect(result.initialFinalQa).toEqual(result.finalQa);
    } finally {
      await db.close();
    }
  });
});

async function seedProject(em: Awaited<ReturnType<typeof createTestOrm>>["em"]): Promise<void> {
  await em.getConnection().execute(
    `insert into projects (id, org_id, name) values (?, ?, ?)`,
    [PROJECT_ID, ORG_ID, "Final QA Feedback Gate Project"],
  );
}

async function seedProjectDoc(
  em: Awaited<ReturnType<typeof createTestOrm>>["em"],
  input: { title: string; body: string },
): Promise<void> {
  await em.getConnection().execute(
    `insert into documents (id, org_id, project_id, title, frontmatter, body_md, content_json, scope, doc_type, archived, sort_position, updated_at)
      values (?, ?, ?, ?, ?::jsonb, ?, ?::jsonb, 'project', 'spec', false, 0, now())`,
    [
      randomUUID(),
      ORG_ID,
      PROJECT_ID,
      input.title,
      JSON.stringify({ title: input.title }),
      input.body,
      JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: input.body }] }] }),
    ],
  );
}

async function seedArtifact(
  em: Awaited<ReturnType<typeof createTestOrm>>["em"],
  input: { runId: string; taskId: string },
): Promise<void> {
  await em.getConnection().execute(
    `insert into artifacts (id, org_id, run_id, task_id, filename, path, mime, metadata_json, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?::jsonb, now())`,
    [
      randomUUID(),
      ORG_ID,
      input.runId,
      input.taskId,
      "final-qa-feedback-gate-proof.md",
      "/tmp/final-qa-feedback-gate-proof.md",
      "text/markdown",
      JSON.stringify({ lifecycleState: "accepted" }),
    ],
  );
}
