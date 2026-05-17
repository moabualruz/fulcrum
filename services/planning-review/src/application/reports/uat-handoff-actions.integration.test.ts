import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { createTestOrm } from "@test-support/application-database.ts";
import { recordTaskQaReview } from "@execution-orchestration/application/qa-review-actions.ts";
import { dispatchTaskRun } from "@execution-orchestration/application/runs/commands.ts";
import { createTask } from "@work-management/application/work-item-commands.ts";
import { buildUatCodeReviewHandoff } from "@planning-review/application/reports/uat-handoff-actions.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_ID = "99999999-9999-4999-8999-999999999999";

describe("review workbench UAT/code review handoff action", () => {
  test("opens UAT and code review prompts only after final QA passes", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await seedProject(em);
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      await seedProjectDoc(em, {
        title: "Accepted plan",
        body: "Trace trace-uat-ready describes user acceptance scope.",
      });
      const task = await createTask(em, ctx, {
        title: "Prepare handoff",
        status: "in_progress",
        projectId: PROJECT_ID,
        descriptionText: "## Success Criteria\n- UAT prompt names the accepted workflow.\n- Code review prompt names the trace.",
      });
      const run = await dispatchTaskRun(em, ctx, {
        taskId: task.id,
        agent: "codex",
        prompt: "Prepare UAT and code review handoff",
      });
      await em.getConnection().execute("update agent_runs set status = 'succeeded' where id = ?", [run.id]);
      await seedArtifact(em, { runId: run.id, taskId: task.id });
      await recordTaskQaReview(em, ctx, {
        taskId: task.id,
        runId: run.id,
        traceId: "trace-uat-ready",
        reviewType: "code",
        reviewerAgent: "qa-reviewer",
        reviewText: "### Verdict: APPROVE\nReady for UAT and code review.",
      });

      const handoff = await buildUatCodeReviewHandoff(em, ctx, {
        projectId: PROJECT_ID,
        traceId: "trace-uat-ready",
      });

      expect(handoff).toMatchObject({
        projectId: PROJECT_ID,
        traceId: "trace-uat-ready",
        status: "ready",
        nextAction: "prompt_user_for_uat_code_review",
        finalQaStatus: "passed",
      });
      expect(handoff.reviewSessions.map((session) => [session.type, session.status])).toEqual([
        ["uat", "pending_user_decision"],
        ["code_review", "pending_user_decision"],
      ]);
      expect(handoff.promptMarkdown).toContain("# UAT And Code Review Handoff");
      expect(handoff.promptMarkdown).toContain("Prepare handoff");
      expect(handoff.promptMarkdown).toContain("Code review prompt names the trace.");
      expect(handoff.promptMarkdown).toContain("trace-uat-ready");
      expect(handoff.decisionOptions.map((option) => option.id)).toEqual([
        "start_uat",
        "start_code_review",
        "request_changes",
        "approve_without_manual_review",
      ]);

      const events = await em.getConnection().execute<Array<{ verb: string; payload: Record<string, unknown> }>>(
        `select verb, payload from events
          where subject_kind = 'project'
            and subject_id = ?
            and verb = 'uat_code_review_prompted'
          order by created_at asc`,
        [PROJECT_ID],
      );
      expect(events).toEqual([
        expect.objectContaining({
          verb: "uat_code_review_prompted",
          payload: expect.objectContaining({
            traceId: "trace-uat-ready",
            status: "ready",
            finalQaStatus: "passed",
          }),
        }),
      ]);
    } finally {
      await db.close();
    }
  });

  test("blocks UAT and code review prompt when final QA still requires automated feedback", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await seedProject(em);
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      const task = await createTask(em, ctx, {
        title: "Fix review blocker",
        status: "in_progress",
        projectId: PROJECT_ID,
        descriptionText: "## Success Criteria\n- Automated feedback is closed.",
      });
      const run = await dispatchTaskRun(em, ctx, {
        taskId: task.id,
        agent: "codex",
        prompt: "Fix review blocker",
      });
      await em.getConnection().execute("update agent_runs set status = 'succeeded' where id = ?", [run.id]);
      await recordTaskQaReview(em, ctx, {
        taskId: task.id,
        runId: run.id,
        traceId: "trace-uat-blocked",
        reviewType: "code",
        reviewerAgent: "qa-reviewer",
        feedbackAgent: "codex",
        reviewText: "### Verdict: REVISE\nAutomated feedback still open.",
      });

      const handoff = await buildUatCodeReviewHandoff(em, ctx, {
        projectId: PROJECT_ID,
        traceId: "trace-uat-blocked",
      });

      expect(handoff).toMatchObject({
        status: "blocked",
        nextAction: "continue_automated_feedback",
        finalQaStatus: "failed",
        reviewSessions: [],
      });
      expect(handoff.promptMarkdown).toContain("Final QA has not passed");
      expect(handoff.promptMarkdown).toContain("continue_automated_feedback");

      const events = await em.getConnection().execute<Array<{ verb: string; payload: Record<string, unknown> }>>(
        `select verb, payload from events
          where subject_kind = 'project'
            and subject_id = ?
            and verb = 'uat_code_review_blocked'
          order by created_at asc`,
        [PROJECT_ID],
      );
      expect(events).toEqual([
        expect.objectContaining({
          verb: "uat_code_review_blocked",
          payload: expect.objectContaining({
            traceId: "trace-uat-blocked",
            status: "blocked",
            finalQaStatus: "failed",
          }),
        }),
      ]);
    } finally {
      await db.close();
    }
  });
});

async function seedProject(em: Awaited<ReturnType<typeof createTestOrm>>["em"]): Promise<void> {
  await em.getConnection().execute(
    `insert into projects (id, org_id, name) values (?, ?, ?)`,
    [PROJECT_ID, ORG_ID, "UAT Handoff Project"],
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
      "uat-handoff-proof.md",
      "/tmp/uat-handoff-proof.md",
      "text/markdown",
      JSON.stringify({ lifecycleState: "accepted" }),
    ],
  );
}
