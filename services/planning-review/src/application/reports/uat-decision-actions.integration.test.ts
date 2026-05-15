import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createTestOrm } from "@test-support/application-database.ts";
import { recordTaskQaReview } from "@execution-orchestration/application/qa-review-actions.ts";
import { dispatchTaskRun } from "@execution-orchestration/application/runs/commands.ts";
import { createTask } from "@work-management/application/work-item-commands.ts";
import {
  applyConfiguredUatCodeReviewDecision,
  UAT_CODE_REVIEW_AUTO_DECISION_SETTING_KEY,
} from "@planning-review/application/reports/uat-auto-decision-actions.ts";
import { runGeneratedE2eRegressionTests } from "@planning-review/application/reports/generated-e2e-run-actions.ts";
import { recordUatCodeReviewDecision } from "@planning-review/application/reports/uat-decision-actions.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_ID = "99999999-9999-4999-8999-999999999999";

describe("review workbench UAT/code review decision action", () => {
  test("approval generates a real-data E2E regression artifact after final QA passes", async () => {
    const db = await createTestOrm();
    const originalArtifactStore = process.env.FULCRUM_ARTIFACT_STORE;
    const artifactStore = await mkdtemp(join(tmpdir(), "fulcrum-uat-e2e-"));
    process.env.FULCRUM_ARTIFACT_STORE = artifactStore;
    try {
      const em = db.em.fork();
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      await seedReadyFinalQaProject(em, ctx, "trace-uat-approval");

      const decision = await recordUatCodeReviewDecision(em, ctx, {
        projectId: PROJECT_ID,
        traceId: "trace-uat-approval",
        decision: "approve_without_manual_review",
        reviewType: "uat",
        feedbackText: "User accepts the final-QA workflow evidence.",
      });

      expect(decision).toMatchObject({
        projectId: PROJECT_ID,
        traceId: "trace-uat-approval",
        status: "approved",
        nextAction: "real_data_e2e_generated",
      });
      expect(decision.generatedE2eTests).toHaveLength(1);
      const generated = decision.generatedE2eTests[0]!;
      expect(generated.filename).toBe("uat-trace-uat-approval.spec.ts");
      expect(generated.body).toContain("Trace trace-uat-approval");
      expect(generated.body).toContain("User can approve accepted evidence.");
      expect(generated.body).toContain("Code review can codify the accepted behavior.");
      expect(generated.body).not.toMatch(/\b(mock|fake)\b/i);
      expect(generated.storePath).toMatch(/uat-trace-uat-approval\.spec\.ts$/);
      expect(generated.bodyPath).toMatch(/uat-trace-uat-approval\.spec\.ts$/);
      expect(await readFile(generated.bodyPath, "utf8")).toBe(generated.body);

      const artifacts = await em.getConnection().execute<Array<{
        filename: string;
        body_path: string;
        metadata_json: Record<string, unknown>;
      }>>(
        `select filename, body_path, metadata_json from artifacts
          where org_id = ?
            and path = ?
          order by created_at asc`,
        [ORG_ID, generated.path],
      );
      expect(artifacts).toEqual([
        expect.objectContaining({
          filename: "uat-trace-uat-approval.spec.ts",
          body_path: generated.bodyPath,
          metadata_json: expect.objectContaining({
            lifecycleState: "accepted",
            generatedBy: "uat_code_review_approval",
            traceId: "trace-uat-approval",
            materializedFile: expect.objectContaining({
              storePath: generated.storePath,
              bodyPath: generated.bodyPath,
            }),
            generatedTestBody: generated.body,
          }),
        }),
      ]);

      const events = await em.getConnection().execute<Array<{ verb: string; payload: Record<string, unknown> }>>(
        `select verb, payload from events
          where subject_kind = 'project'
            and subject_id = ?
            and verb = 'uat_code_review_decision_recorded'
          order by created_at asc`,
        [PROJECT_ID],
      );
      expect(events).toEqual([
        expect.objectContaining({
          verb: "uat_code_review_decision_recorded",
          payload: expect.objectContaining({
            decision: "approve_without_manual_review",
            status: "approved",
            generatedE2eArtifactIds: [generated.artifactId],
          }),
        }),
      ]);

      const run = await runGeneratedE2eRegressionTests(em, ctx, {
        projectId: PROJECT_ID,
        traceId: "trace-uat-approval",
      });
      expect(run).toMatchObject({
        projectId: PROJECT_ID,
        traceId: "trace-uat-approval",
        status: "passed",
        command: ["bun", "test", generated.bodyPath],
        testFiles: [generated.bodyPath],
      });
      expect(`${run.stdout}\n${run.stderr}`).toContain("pass");
      expect(run.eventId).toBeString();
    } finally {
      if (originalArtifactStore === undefined) delete process.env.FULCRUM_ARTIFACT_STORE;
      else process.env.FULCRUM_ARTIFACT_STORE = originalArtifactStore;
      await rm(artifactStore, { recursive: true, force: true });
      await db.close();
    }
  });

  test("requested changes schedule feedback runs instead of generating E2E artifacts", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      const { taskId } = await seedReadyFinalQaProject(em, ctx, "trace-uat-changes");

      const decision = await recordUatCodeReviewDecision(em, ctx, {
        projectId: PROJECT_ID,
        traceId: "trace-uat-changes",
        decision: "request_changes",
        reviewType: "code_review",
        feedbackText: "Tighten the UAT wording before approval.",
        feedbackAgent: "codex",
      });

      expect(decision).toMatchObject({
        status: "changes_requested",
        nextAction: "feedback_run_scheduled",
        generatedE2eTests: [],
      });
      expect(decision.feedbackRuns).toEqual([
        expect.objectContaining({ taskId, agent: "codex", status: "queued" }),
      ]);

      const artifacts = await em.getConnection().execute<Array<{ id: string }>>(
        `select id from artifacts where metadata_json->>'generatedBy' = 'uat_code_review_approval'`,
      );
      expect(artifacts).toEqual([]);
    } finally {
      await db.close();
    }
  });

  test("configured auto-decision applies approval and generates real-data E2E after final QA passes", async () => {
    const db = await createTestOrm();
    const originalArtifactStore = process.env.FULCRUM_ARTIFACT_STORE;
    const artifactStore = await mkdtemp(join(tmpdir(), "fulcrum-uat-auto-e2e-"));
    process.env.FULCRUM_ARTIFACT_STORE = artifactStore;
    try {
      const em = db.em.fork();
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      await seedReadyFinalQaProject(em, ctx, "trace-uat-auto");
      await em.getConnection().execute(
        `insert into tenant_settings (org_id, key, value)
          values (?, ?, ?::jsonb)`,
        [
          ORG_ID,
          UAT_CODE_REVIEW_AUTO_DECISION_SETTING_KEY,
          JSON.stringify({
            enabled: true,
            decision: "approve_without_manual_review",
            reviewType: "code_review",
            feedbackText: "Auto-approve once final QA evidence is complete.",
            e2eRunner: "bun",
          }),
        ],
      );

      const result = await applyConfiguredUatCodeReviewDecision(em, ctx, {
        projectId: PROJECT_ID,
        traceId: "trace-uat-auto",
      });

      expect(result).toMatchObject({
        projectId: PROJECT_ID,
        traceId: "trace-uat-auto",
        status: "applied",
        nextAction: "real_data_e2e_generated",
        settingKey: UAT_CODE_REVIEW_AUTO_DECISION_SETTING_KEY,
        config: {
          enabled: true,
          decision: "approve_without_manual_review",
          reviewType: "code_review",
          e2eRunner: "bun",
        },
        decision: {
          status: "approved",
          nextAction: "real_data_e2e_generated",
          reviewType: "code_review",
        },
      });
      expect(result.decision?.generatedE2eTests).toHaveLength(1);
      expect(result.decision?.generatedE2eTests[0]?.filename).toBe("uat-trace-uat-auto.spec.ts");
      expect(await readFile(result.decision!.generatedE2eTests[0]!.bodyPath, "utf8")).toBe(result.decision!.generatedE2eTests[0]!.body);

      const events = await em.getConnection().execute<Array<{ verb: string; payload: Record<string, unknown> }>>(
        `select verb, payload from events
          where subject_kind = 'project'
            and subject_id = ?
            and verb = 'uat_code_review_auto_decision_applied'
          order by created_at asc`,
        [PROJECT_ID],
      );
      expect(events).toEqual([
        expect.objectContaining({
          verb: "uat_code_review_auto_decision_applied",
          payload: expect.objectContaining({
            traceId: "trace-uat-auto",
            settingKey: UAT_CODE_REVIEW_AUTO_DECISION_SETTING_KEY,
            decision: "approve_without_manual_review",
            reviewType: "code_review",
            status: "applied",
            nextAction: "real_data_e2e_generated",
          }),
        }),
      ]);
    } finally {
      if (originalArtifactStore === undefined) delete process.env.FULCRUM_ARTIFACT_STORE;
      else process.env.FULCRUM_ARTIFACT_STORE = originalArtifactStore;
      await rm(artifactStore, { recursive: true, force: true });
      await db.close();
    }
  });

  test("approval can generate Playwright-backed E2E artifacts with CI runner metadata", async () => {
    const db = await createTestOrm();
    const originalArtifactStore = process.env.FULCRUM_ARTIFACT_STORE;
    const artifactStore = await mkdtemp(join(tmpdir(), "fulcrum-uat-playwright-e2e-"));
    process.env.FULCRUM_ARTIFACT_STORE = artifactStore;
    try {
      const em = db.em.fork();
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      await seedReadyFinalQaProject(em, ctx, "trace-uat-playwright");

      const decision = await recordUatCodeReviewDecision(em, ctx, {
        projectId: PROJECT_ID,
        traceId: "trace-uat-playwright",
        decision: "approve_without_manual_review",
        reviewType: "uat",
        feedbackText: "User accepts the Playwright-backed workflow evidence.",
        e2eRunner: "playwright",
      });

      expect(decision).toMatchObject({
        status: "approved",
        nextAction: "real_data_e2e_generated",
      });
      const generated = decision.generatedE2eTests[0]!;
      expect(generated.runner).toBe("playwright");
      expect(generated.filename).toBe("uat-trace-uat-playwright.spec.ts");
      expect(generated.body).toContain('from "@playwright/test"');
      expect(generated.body).toContain("User can approve accepted evidence.");

      const artifacts = await em.getConnection().execute<Array<{
        metadata_json: Record<string, unknown>;
      }>>(
        `select metadata_json from artifacts
          where org_id = ?
            and path = ?`,
        [ORG_ID, generated.path],
      );
      expect(artifacts[0]?.metadata_json).toMatchObject({
        runner: "playwright",
        ciCommand: ["bun", "run", "scripts/ci-generated-e2e.ts"],
        ciEnv: {
          FULCRUM_GENERATED_E2E_RUNNER: "playwright",
          FULCRUM_GENERATED_E2E_FILES: generated.bodyPath,
        },
      });

      const plannedRun = await runGeneratedE2eRegressionTests(em, ctx, {
        projectId: PROJECT_ID,
        traceId: "trace-uat-playwright",
        runner: "playwright",
        planOnly: true,
      });
      expect(plannedRun).toMatchObject({
        projectId: PROJECT_ID,
        traceId: "trace-uat-playwright",
        runner: "playwright",
        status: "planned",
        cwd: "apps/web",
        command: ["bun", "run", "web:e2e:generated", "--", generated.bodyPath],
        testFiles: [generated.bodyPath],
        ciCommand: ["bun", "run", "scripts/ci-generated-e2e.ts"],
        ciEnv: {
          FULCRUM_GENERATED_E2E_RUNNER: "playwright",
          FULCRUM_GENERATED_E2E_FILES: generated.bodyPath,
        },
      });
    } finally {
      if (originalArtifactStore === undefined) delete process.env.FULCRUM_ARTIFACT_STORE;
      else process.env.FULCRUM_ARTIFACT_STORE = originalArtifactStore;
      await rm(artifactStore, { recursive: true, force: true });
      await db.close();
    }
  });

  test("approval synthesizes per-task UAT coverage cases into generated E2E artifacts", async () => {
    const db = await createTestOrm();
    const originalArtifactStore = process.env.FULCRUM_ARTIFACT_STORE;
    const artifactStore = await mkdtemp(join(tmpdir(), "fulcrum-uat-coverage-e2e-"));
    process.env.FULCRUM_ARTIFACT_STORE = artifactStore;
    try {
      const em = db.em.fork();
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      const seeded = await seedReadyFinalQaProject(em, ctx, "trace-uat-coverage", [
        {
          title: "Approve UAT workflow",
          criteria: [
            "User can approve accepted evidence.",
            "Code review can codify the accepted behavior.",
          ],
        },
        {
          title: "Codify generated regression coverage",
          criteria: [
            "Generated regression links accepted artifacts.",
            "Generated regression uses accepted real data.",
          ],
        },
      ]);

      const decision = await recordUatCodeReviewDecision(em, ctx, {
        projectId: PROJECT_ID,
        traceId: "trace-uat-coverage",
        decision: "approve_without_manual_review",
        reviewType: "uat",
        feedbackText: "User accepts all synthesized UAT coverage.",
      });

      expect(decision.generatedE2eTests).toHaveLength(2);
      expect(decision.generatedE2eTests.map((test) => test.filename)).toEqual([
        "uat-trace-uat-coverage-approve-uat-workflow.spec.ts",
        "uat-trace-uat-coverage-codify-generated-regression-coverage.spec.ts",
      ]);
      expect(decision.generatedE2eTests.map((test) => test.sourceTaskIds)).toEqual([
        [seeded.taskIds[0]!],
        [seeded.taskIds[1]!],
      ]);
      expect(decision.generatedE2eTests.flatMap((test) => test.coverageCases.map((coverage) => coverage.criterion))).toEqual([
        "User can approve accepted evidence.",
        "Code review can codify the accepted behavior.",
        "Generated regression links accepted artifacts.",
        "Generated regression uses accepted real data.",
      ]);
      for (const generated of decision.generatedE2eTests) {
        expect(generated.coverageCases).toHaveLength(2);
        expect(generated.body).toContain("coverageCases");
        expect(generated.body).toContain("artifactIds");
        expect(generated.body).not.toMatch(/\b(mock|fake)\b/i);
        expect(await readFile(generated.bodyPath, "utf8")).toBe(generated.body);
      }

      const artifacts = await em.getConnection().execute<Array<{
        filename: string;
        metadata_json: Record<string, unknown>;
      }>>(
        `select filename, metadata_json from artifacts
          where org_id = ?
            and metadata_json->>'traceId' = ?
            and metadata_json->>'generatedBy' = 'uat_code_review_approval'
          order by created_at asc, filename asc`,
        [ORG_ID, "trace-uat-coverage"],
      );
      expect(artifacts).toHaveLength(2);
      expect(artifacts.map((artifact) => artifact.metadata_json)).toEqual([
        expect.objectContaining({
          coverageSummary: expect.objectContaining({ taskCount: 1, criterionCount: 2, artifactCount: 1 }),
          coverageCases: decision.generatedE2eTests[0]!.coverageCases,
        }),
        expect.objectContaining({
          coverageSummary: expect.objectContaining({ taskCount: 1, criterionCount: 2, artifactCount: 1 }),
          coverageCases: decision.generatedE2eTests[1]!.coverageCases,
        }),
      ]);

      const run = await runGeneratedE2eRegressionTests(em, ctx, {
        projectId: PROJECT_ID,
        traceId: "trace-uat-coverage",
      });
      expect(run).toMatchObject({
        projectId: PROJECT_ID,
        traceId: "trace-uat-coverage",
        status: "passed",
        command: ["bun", "test", ...decision.generatedE2eTests.map((test) => test.bodyPath)],
        testFiles: decision.generatedE2eTests.map((test) => test.bodyPath),
      });
    } finally {
      if (originalArtifactStore === undefined) delete process.env.FULCRUM_ARTIFACT_STORE;
      else process.env.FULCRUM_ARTIFACT_STORE = originalArtifactStore;
      await rm(artifactStore, { recursive: true, force: true });
      await db.close();
    }
  });
});

interface SeedFinalQaTaskSpec {
  title: string;
  criteria: string[];
}

async function seedReadyFinalQaProject(
  em: Awaited<ReturnType<typeof createTestOrm>>["em"],
  ctx: { orgId: string; userId: string; projectId: string },
  traceId: string,
  taskSpecs: SeedFinalQaTaskSpec[] = [{
    title: "Approve UAT workflow",
    criteria: [
      "User can approve accepted evidence.",
      "Code review can codify the accepted behavior.",
    ],
  }],
): Promise<{ taskId: string; taskIds: string[] }> {
  await em.getConnection().execute(
    `insert into projects (id, org_id, name) values (?, ?, ?)`,
    [PROJECT_ID, ORG_ID, "UAT Decision Project"],
  );
  await em.getConnection().execute(
    `insert into documents (id, org_id, project_id, title, frontmatter, body_md, content_json, scope, doc_type, archived, sort_position, updated_at)
      values (?, ?, ?, ?, ?::jsonb, ?, ?::jsonb, 'project', 'spec', false, 0, now())`,
    [
      randomUUID(),
      ORG_ID,
      PROJECT_ID,
      "Accepted UAT workflow",
      JSON.stringify({ title: "Accepted UAT workflow" }),
      `Trace ${traceId} captures accepted user workflow evidence.`,
      JSON.stringify({ type: "doc", content: [] }),
    ],
  );
  const taskIds: string[] = [];
  for (const taskSpec of taskSpecs) {
    const task = await createTask(em, ctx, {
      title: taskSpec.title,
      status: "in_progress",
      projectId: PROJECT_ID,
      descriptionText: [
        "## Success Criteria",
        ...taskSpec.criteria.map((criterion) => `- ${criterion}`),
      ].join("\n"),
    });
    taskIds.push(task.id);
    const run = await dispatchTaskRun(em, ctx, {
      taskId: task.id,
      agent: "codex",
      prompt: `Prepare UAT decision evidence for ${taskSpec.title}`,
    });
    await em.getConnection().execute("update agent_runs set status = 'succeeded' where id = ?", [run.id]);
    await em.getConnection().execute(
      `insert into artifacts (id, org_id, run_id, task_id, filename, path, mime, metadata_json, created_at)
        values (?, ?, ?, ?, ?, ?, ?, ?::jsonb, now())`,
      [
        randomUUID(),
        ORG_ID,
        run.id,
        task.id,
        `${slugForSeed(taskSpec.title)}-proof.md`,
        `/tmp/${slugForSeed(taskSpec.title)}-proof.md`,
        "text/markdown",
        JSON.stringify({ lifecycleState: "accepted" }),
      ],
    );
    await recordTaskQaReview(em, ctx, {
      taskId: task.id,
      runId: run.id,
      traceId,
      reviewType: "code",
      reviewerAgent: "qa-reviewer",
      reviewText: "### Verdict: APPROVE\nUAT decision evidence is ready.",
    });
  }
  return { taskId: taskIds[0]!, taskIds };
}

function slugForSeed(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "task";
}
