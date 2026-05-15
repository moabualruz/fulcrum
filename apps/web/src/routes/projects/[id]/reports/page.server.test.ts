import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { recordTaskQaReview } from "@execution-orchestration/application/qa-review-actions.ts";
import { UAT_CODE_REVIEW_AUTO_DECISION_SETTING_KEY } from "@planning-review/application/reports/uat-auto-decision-actions.ts";
import { dispatchTaskRun } from "@execution-orchestration/application/runs/commands.ts";
import { createTask } from "@work-management/application/tasks/commands.ts";
import { __setApplicationScopeForTest } from "$lib/server/application-scope";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import {
  createLocalOrg,
  createProject,
} from "@test-support/product-workspace-fixtures.ts";
import { makeId } from "@test-support/product-workspace-fixtures.ts";
import { createTestOrm } from "@test-support/application-database.ts";

let scratch: string;
let restoreScope: (() => void) | null = null;

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_ID = "99999999-9999-4999-8999-999999999999";

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-reports-page-"));
  process.env["FULCRUM_HOME"] = scratch;
  process.env["FULCRUM_ARTIFACT_STORE"] = join(scratch, "artifacts");
});

afterEach(() => {
  restoreScope?.();
  restoreScope = null;
  delete process.env["FULCRUM_HOME"];
  delete process.env["FULCRUM_ARTIFACT_STORE"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedProject(): Promise<{ id: string; orgId: string }> {
  const dbDir = join(scratch, "pglite.data");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(dbDir);
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, {
    orgId: org.id,
    slug: "proj",
    name: "Proj",
  });
  await db.close();
  return { id: project.id, orgId: org.id };
}

async function seedProjectWithSprint(): Promise<{ projectId: string; sprintId: string; orgId: string }> {
  const dbDir = join(scratch, "pglite.data");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(dbDir);
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, {
    orgId: org.id,
    slug: "proj",
    name: "Proj",
  });
  const sprintId = makeId();
  await db.query(
    `INSERT INTO sprints (id, org_id, project_id, name, start_date, end_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [sprintId, org.id, project.id, "Sprint 1", "2025-01-01", "2025-01-14", "active"],
  );
  await db.query(
    `INSERT INTO tasks (id, org_id, project_id, title, status, priority, sprint_id, story_points)
       VALUES ($1,$2,$3,$4,$5,0,$6,$7)`,
    [makeId(), org.id, project.id, "task1", "pending", sprintId, 5],
  );
  await db.close();
  return { projectId: project.id, sprintId, orgId: org.id };
}

describe("/projects/[id]/reports +page.server.ts", () => {
  test("load returns reports data with all six chart datasets", async () => {
    const { id, orgId } = await seedProject();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const url = new URL("http://localhost/projects/x/reports");
    const result = await mod.load({
      params: { id },
      url,
      locals: { orgId },
    } as Parameters<typeof mod.load>[0]);

    expect(result.project.id).toBe(id);
    expect(result.reports).toBeDefined();
    expect(result.reports.sprints).toEqual([]);
    expect(result.reports.burndown).toEqual([]);
    expect(result.reports.velocity).toEqual([]);
    expect(result.reports.cycleTime).toEqual({ bins: [], p50: 0, p90: 0 });
    expect(result.reports.throughput).toEqual([]);
    expect(result.reports.wip).toEqual([]);
    expect(result.reports.cfd).toEqual([]);
  });

  test("load with sprint param returns burndown data", async () => {
    const { projectId, sprintId, orgId } = await seedProjectWithSprint();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const url = new URL(`http://localhost/projects/x/reports?sprint=${sprintId}`);
    const result = await mod.load({
      params: { id: projectId },
      url,
      locals: { orgId },
    } as Parameters<typeof mod.load>[0]);

    expect(result.reports.sprints).toHaveLength(1);
    expect(result.selectedSprintId).toBe(sprintId);
    // Burndown should have points (5 story points seeded)
    expect(result.reports.burndown.length).toBeGreaterThan(0);
  });

  test("load throws 404 for nonexistent project", async () => {
    await seedProject(); // ensure DB exists
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const url = new URL("http://localhost/projects/x/reports");
    let caught: unknown;
    try {
      await mod.load({
        params: { id: "01JBOGUS000000000000000000" },
        url,
      } as Parameters<typeof mod.load>[0]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(
      typeof caught === "object" && caught !== null && "status" in caught &&
        (caught as { status: number }).status === 404,
    ).toBe(true);
  });

  test("final QA gate, UAT handoff, and UAT decision actions run shared report services with project and trace", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      await em.getConnection().execute(
        `insert into projects (id, org_id, name) values (?, ?, ?)`,
        [PROJECT_ID, ORG_ID, "Reports Final QA Project"],
      );
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      await em.getConnection().execute(
        `insert into documents (id, org_id, project_id, title, frontmatter, body_md, content_json, scope, doc_type, archived, sort_position, updated_at)
          values (?, ?, ?, ?, ?::jsonb, ?, ?::jsonb, 'project', 'spec', false, 0, now())`,
        [
          randomUUID(),
          ORG_ID,
          PROJECT_ID,
          "Final QA spec",
          JSON.stringify({ title: "Final QA spec" }),
          "Trace trace-web-final-qa covers web handoff.",
          JSON.stringify({ type: "doc", content: [] }),
        ],
      );
      const task = await createTask(em, ctx, {
        title: "Expose final QA web trigger",
        status: "in_progress",
        projectId: PROJECT_ID,
        descriptionText: "## Success Criteria\n- Web reports can run final QA with the same trace id.",
      });
      const run = await dispatchTaskRun(em, ctx, {
        taskId: task.id,
        agent: "codex",
        prompt: "Implement reports final QA web trigger",
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
          "web-final-qa-proof.md",
          "/tmp/web-final-qa-proof.md",
          "text/markdown",
          JSON.stringify({ lifecycleState: "accepted" }),
        ],
      );
      await recordTaskQaReview(em, ctx, {
        taskId: task.id,
        runId: run.id,
        traceId: "trace-web-final-qa",
        reviewType: "code",
        reviewerAgent: "qa-reviewer",
        reviewText: "### Verdict: APPROVE\nWeb handoff criteria pass.",
      });
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
            feedbackText: "Auto approve from web reports.",
            e2eRunner: "bun",
          }),
        ],
      );
      restoreScope = __setApplicationScopeForTest({ em, orgId: ORG_ID, userId: USER_ID });
      const route = await import(`./+page.server.ts?finalQaCachebust=${Date.now()}`);
      const fd = new FormData();
      fd.set("traceId", "trace-web-final-qa");

      const result = await route.actions.finalQa({
        params: { id: PROJECT_ID },
        request: new Request("http://localhost/projects/x/reports", { method: "POST", body: fd }),
        locals: {},
      } as Parameters<typeof route.actions.finalQa>[0]);

      expect(result).toMatchObject({
        ok: true,
        mode: "finalQa",
        report: {
          projectId: PROJECT_ID,
          traceId: "trace-web-final-qa",
          status: "passed",
          nextAction: "prompt_uat_code_review",
          readyForUserAcceptance: true,
        },
      });

      const gateFd = new FormData();
      gateFd.set("traceId", "trace-web-final-qa");
      gateFd.set("reviewerAgent", "qa-reviewer");
      gateFd.set("feedbackAgent", "codex");
      gateFd.set("maxIterations", "3");
      const gate = await route.actions.finalQaGate({
        params: { id: PROJECT_ID },
        request: new Request("http://localhost/projects/x/reports", { method: "POST", body: gateFd }),
        locals: {},
      } as Parameters<typeof route.actions.finalQaGate>[0]);

      expect(gate).toMatchObject({
        ok: true,
        mode: "finalQaGate",
        gate: {
          projectId: PROJECT_ID,
          traceId: "trace-web-final-qa",
          loopAttempted: false,
          readyForUserAcceptance: true,
          nextAction: "prompt_uat_code_review",
          finalQa: {
            status: "passed",
            readyForUserAcceptance: true,
            summary: {
              openFeedbackRunCount: 0,
            },
          },
        },
      });

      const handoffFd = new FormData();
      handoffFd.set("traceId", "trace-web-final-qa");
      const handoff = await route.actions.uatHandoff({
        params: { id: PROJECT_ID },
        request: new Request("http://localhost/projects/x/reports", { method: "POST", body: handoffFd }),
        locals: {},
      } as Parameters<typeof route.actions.uatHandoff>[0]);

      expect(handoff).toMatchObject({
        ok: true,
        mode: "uatHandoff",
        handoff: {
          projectId: PROJECT_ID,
          traceId: "trace-web-final-qa",
          status: "ready",
          nextAction: "prompt_user_for_uat_code_review",
          finalQaStatus: "passed",
        },
      });

      const decisionFd = new FormData();
      decisionFd.set("traceId", "trace-web-final-qa");
      decisionFd.set("decision", "approve_without_manual_review");
      decisionFd.set("reviewType", "uat");
      decisionFd.set("feedbackText", "Approved from web UAT.");
      const decision = await route.actions.uatDecision({
        params: { id: PROJECT_ID },
        request: new Request("http://localhost/projects/x/reports", { method: "POST", body: decisionFd }),
        locals: {},
      } as Parameters<typeof route.actions.uatDecision>[0]);

      expect(decision).toMatchObject({
        ok: true,
        mode: "uatDecision",
        decision: {
          projectId: PROJECT_ID,
          traceId: "trace-web-final-qa",
          status: "approved",
          nextAction: "real_data_e2e_generated",
          generatedE2eTests: [
            expect.objectContaining({ filename: "uat-trace-web-final-qa.spec.ts" }),
          ],
        },
      });

      const autoDecisionFd = new FormData();
      autoDecisionFd.set("traceId", "trace-web-auto");
      const autoDecision = await route.actions.autoDecision({
        params: { id: PROJECT_ID },
        request: new Request("http://localhost/projects/x/reports", { method: "POST", body: autoDecisionFd }),
        locals: {},
      } as Parameters<typeof route.actions.autoDecision>[0]);

      expect(autoDecision).toMatchObject({
        ok: true,
        mode: "autoDecision",
        autoDecision: {
          projectId: PROJECT_ID,
          traceId: "trace-web-auto",
          status: "applied",
          nextAction: "real_data_e2e_generated",
          decision: {
            status: "approved",
          },
        },
      });

      const e2eRunFd = new FormData();
      e2eRunFd.set("traceId", "trace-web-final-qa");
      const e2eRun = await route.actions.e2eRun({
        params: { id: PROJECT_ID },
        request: new Request("http://localhost/projects/x/reports", { method: "POST", body: e2eRunFd }),
        locals: {},
      } as Parameters<typeof route.actions.e2eRun>[0]);

      expect(e2eRun).toMatchObject({
        ok: true,
        mode: "e2eRun",
        e2eRun: {
          projectId: PROJECT_ID,
          traceId: "trace-web-final-qa",
          status: "passed",
        },
      });
    } finally {
      await db.close();
    }
  });

  test("reviewWorkbench action builds review workbench workbench state without client-side review logic", async () => {
    const route = await import(`./+page.server.ts?reviewWorkbenchCachebust=${Date.now()}`);
    const fd = new FormData();
    fd.set("traceId", "trace-web-review");
    fd.set("reviewId", "review-web-1");
    fd.set("searchQuery", "trace");
    fd.set("selectedFilePath", "src/app.ts");
    fd.set("viewedFilePaths", "src/other.ts");
    fd.set("hideViewedFiles", "on");
    fd.set("filesJson", JSON.stringify([{
      path: "src/app.ts",
      patch: "@@ -1 +1 @@\n+trace",
      additions: 1,
      deletions: 0,
    }]));
    fd.set("annotationsJson", JSON.stringify([{
      id: "ann-web",
      type: "comment",
      filePath: "src/app.ts",
      lineStart: 1,
      lineEnd: 1,
      side: "new",
      text: "Web review note",
      createdAt: 1,
    }]));

    const result = await route.actions.reviewWorkbench({
      params: { id: PROJECT_ID },
      request: new Request("http://localhost/projects/x/reports", { method: "POST", body: fd }),
      locals: {},
    } as Parameters<typeof route.actions.reviewWorkbench>[0]);

    expect(result).toMatchObject({
      ok: true,
      mode: "reviewWorkbench",
      reviewWorkbench: {
        projectId: PROJECT_ID,
        traceId: "trace-web-review",
        reviewId: "review-web-1",
        summary: {
          fileCount: 1,
          annotationCount: 1,
          searchMatchCount: 1,
        },
      },
    });
  });

  test("reviewSession actions save and reload persisted review workbench workbench sessions", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      await em.getConnection().execute(
        `insert into projects (id, org_id, name) values (?, ?, ?)`,
        [PROJECT_ID, ORG_ID, "Reports Review Session Project"],
      );
      restoreScope = __setApplicationScopeForTest({ em, orgId: ORG_ID, userId: USER_ID });
      const route = await import(`./+page.server.ts?reviewSessionCachebust=${Date.now()}`);

      const saveFd = new FormData();
      saveFd.set("traceId", "trace-web-review-session");
      saveFd.set("reviewId", "review-web-session");
      saveFd.set("reviewType", "code_review");
      saveFd.set("title", "Web persisted review");
      saveFd.set("searchQuery", "trace");
      saveFd.set("filesJson", JSON.stringify([{
        path: "src/app.ts",
        patch: "@@ -1 +1 @@\n+trace",
        additions: 1,
        deletions: 0,
      }]));
      saveFd.set("annotationsJson", JSON.stringify([{
        id: "ann-web-session",
        type: "comment",
        filePath: "src/app.ts",
        lineStart: 1,
        lineEnd: 1,
        side: "new",
        text: "Persisted web review note",
        createdAt: 1,
      }]));

      const saved = await route.actions.reviewSessionSave({
        params: { id: PROJECT_ID },
        request: new Request("http://localhost/projects/x/reports", { method: "POST", body: saveFd }),
        locals: {},
      } as Parameters<typeof route.actions.reviewSessionSave>[0]);

      expect(saved).toMatchObject({
        ok: true,
        mode: "reviewSession",
        reviewSession: {
          projectId: PROJECT_ID,
          traceId: "trace-web-review-session",
          reviewId: "review-web-session",
          status: "saved",
          revision: 1,
          model: {
            summary: {
              fileCount: 1,
              annotationCount: 1,
              searchMatchCount: 1,
            },
          },
        },
      });

      const loadFd = new FormData();
      loadFd.set("reviewId", "review-web-session");
      loadFd.set("searchQuery", "trace");
      const loaded = await route.actions.reviewSessionLoad({
        params: { id: PROJECT_ID },
        request: new Request("http://localhost/projects/x/reports", { method: "POST", body: loadFd }),
        locals: {},
      } as Parameters<typeof route.actions.reviewSessionLoad>[0]);

      expect(loaded).toMatchObject({
        ok: true,
        mode: "reviewSession",
        reviewSession: {
          projectId: PROJECT_ID,
          traceId: "trace-web-review-session",
          reviewId: "review-web-session",
          status: "loaded",
          revision: 1,
          model: {
            summary: {
              annotationCount: 1,
              searchMatchCount: 1,
            },
          },
        },
      });

      const annotateFd = new FormData();
      annotateFd.set("reviewId", "review-web-session");
      annotateFd.set("annotationId", "ann-web-inline");
      annotateFd.set("type", "suggestion");
      annotateFd.set("filePath", "src/app.ts");
      annotateFd.set("lineStart", "1");
      annotateFd.set("lineEnd", "1");
      annotateFd.set("side", "new");
      annotateFd.set("annotationText", "Inline persisted review note");
      annotateFd.set("suggestedCode", "trace()");
      annotateFd.set("searchQuery", "trace");
      const annotated = await route.actions.reviewSessionAnnotate({
        params: { id: PROJECT_ID },
        request: new Request("http://localhost/projects/x/reports", { method: "POST", body: annotateFd }),
        locals: {},
      } as Parameters<typeof route.actions.reviewSessionAnnotate>[0]);

      expect(annotated).toMatchObject({
        ok: true,
        mode: "reviewSession",
        reviewSession: {
          projectId: PROJECT_ID,
          traceId: "trace-web-review-session",
          reviewId: "review-web-session",
          status: "annotated",
          revision: 2,
          model: {
            summary: {
              annotationCount: 2,
              suggestionCount: 1,
              searchMatchCount: 1,
            },
          },
        },
      });
    } finally {
      await db.close();
    }
  });
});
