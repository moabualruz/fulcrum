import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { createTestOrm } from "@test-support/application-database.ts";
import { recordTaskQaReview } from "@execution-orchestration/application/qa-review-actions.ts";
import { dispatchTaskRun } from "@execution-orchestration/application/runs/commands.ts";
import { createTask } from "@work-management/application/work-item-commands.ts";
import { buildFinalQaReport } from "@planning-review/application/reports/final-qa-actions.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_ID = "99999999-9999-4999-8999-999999999999";

describe("review-orchestration final QA report action", () => {
  test("passes only after docs, success criteria, runs, artifacts, dependencies, and QA approvals line up", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await seedProject(em);
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      await seedProjectDoc(em, {
        title: "Approved release plan",
        body: "Trace trace-final-pass covers release task success criteria.",
      });
      const task = await createTask(em, ctx, {
        title: "Release dependency runner",
        status: "in_progress",
        projectId: PROJECT_ID,
        descriptionText: [
          "## Success Criteria",
          "- Dependency tree is disclosed before execution.",
          "- Corrective feedback runs are closed before user handoff.",
        ].join("\n"),
      });
      const run = await dispatchTaskRun(em, ctx, {
        taskId: task.id,
        agent: "codex",
        model: "gpt-task",
        prompt: "Implement dependency runner",
      });
      await em.getConnection().execute("update agent_runs set status = 'succeeded' where id = ?", [run.id]);
      await seedArtifact(em, { runId: run.id, taskId: task.id });
      await recordTaskQaReview(em, ctx, {
        taskId: task.id,
        runId: run.id,
        traceId: "trace-final-pass",
        reviewType: "code",
        reviewerAgent: "qa-reviewer",
        reviewText: "### Verdict: APPROVE\nAll success criteria are satisfied.",
      });

      const report = await buildFinalQaReport(em, ctx, {
        projectId: PROJECT_ID,
        traceId: "trace-final-pass",
      });

      expect(report).toMatchObject({
        projectId: PROJECT_ID,
        traceId: "trace-final-pass",
        status: "passed",
        readyForUserAcceptance: true,
        nextAction: "prompt_uat_code_review",
      });
      expect(report.summary).toMatchObject({
        taskCount: 1,
        docCount: 1,
        runCount: 1,
        artifactCount: 1,
        successCriteriaCount: 2,
        approvedTaskCount: 1,
        openFeedbackRunCount: 0,
      });
      expect(report.checks.map((check) => [check.id, check.status])).toEqual([
        ["docs-present", "pass"],
        ["success-criteria-approved", "pass"],
        ["dependencies-resolved", "pass"],
        ["automated-feedback-closed", "pass"],
        ["runs-succeeded", "pass"],
        ["artifacts-linked", "pass"],
      ]);
      expect(report.taskResults[0]).toMatchObject({
        taskId: task.id,
        latestVerdict: "APPROVE",
        status: "in_review",
        successCriteria: [
          "Dependency tree is disclosed before execution.",
          "Corrective feedback runs are closed before user handoff.",
        ],
      });
      expect(report.markdown).toContain("# Final QA Report");
      expect(report.markdown).toContain("Status: passed");
      expect(report.markdown).toContain(task.id);

      const events = await em.getConnection().execute<Array<{ verb: string; payload: Record<string, unknown> }>>(
        `select verb, payload from events
          where subject_kind = 'project'
            and subject_id = ?
            and verb = 'final_qa_completed'
          order by created_at asc`,
        [PROJECT_ID],
      );
      expect(events).toEqual([
        expect.objectContaining({
          verb: "final_qa_completed",
          payload: expect.objectContaining({
            traceId: "trace-final-pass",
            status: "passed",
            nextAction: "prompt_uat_code_review",
          }),
        }),
      ]);
    } finally {
      await db.close();
    }
  });

  test("fails and keeps automated feedback active when latest QA verdict is REVISE", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await seedProject(em);
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      const task = await createTask(em, ctx, {
        title: "Fix QA loop",
        status: "in_progress",
        projectId: PROJECT_ID,
        descriptionText: "## Success Criteria\n- Feedback runs continue until QA passes.",
      });
      const run = await dispatchTaskRun(em, ctx, {
        taskId: task.id,
        agent: "codex",
        prompt: "Implement QA loop",
      });
      await em.getConnection().execute("update agent_runs set status = 'succeeded' where id = ?", [run.id]);
      await recordTaskQaReview(em, ctx, {
        taskId: task.id,
        runId: run.id,
        traceId: "trace-final-fail",
        reviewType: "code",
        reviewerAgent: "qa-reviewer",
        feedbackAgent: "codex",
        reviewText: "### Verdict: REVISE\nMissing final QA package.",
      });

      const report = await buildFinalQaReport(em, ctx, {
        projectId: PROJECT_ID,
        traceId: "trace-final-fail",
      });

      expect(report).toMatchObject({
        status: "failed",
        readyForUserAcceptance: false,
        nextAction: "continue_automated_feedback",
      });
      expect(report.summary.openFeedbackRunCount).toBe(1);
      expect(report.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "docs-present",
          status: "fail",
        }),
        expect.objectContaining({
          id: "success-criteria-approved",
          status: "fail",
          details: expect.stringContaining("REVISE"),
        }),
        expect.objectContaining({
          id: "automated-feedback-closed",
          status: "fail",
          details: expect.stringContaining("1 open feedback run"),
        }),
      ]));
      expect(report.taskResults[0]).toMatchObject({
        taskId: task.id,
        latestVerdict: "REVISE",
        openFeedbackRunIds: [expect.any(String)],
      });
    } finally {
      await db.close();
    }
  });
});

async function seedProject(em: Awaited<ReturnType<typeof createTestOrm>>["em"]): Promise<void> {
  await em.getConnection().execute(
    `insert into projects (id, org_id, name) values (?, ?, ?)`,
    [PROJECT_ID, ORG_ID, "Final QA Project"],
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
      "final-qa-proof.md",
      "/tmp/final-qa-proof.md",
      "text/markdown",
      JSON.stringify({ lifecycleState: "accepted" }),
    ],
  );
}
