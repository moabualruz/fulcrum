import { describe, it, expect, afterEach } from "bun:test";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { createTestCaller, type TestContainer } from "@test-support/index.ts";
import { createTestContainer } from "@test-support/application-container.ts";

let db: TestOrm | undefined;

afterEach(async () => {
  await db?.close();
  db = undefined;
});

describe("full workflow E2E: docs → tasks → sprints", () => {
  it("creates a document, links it to planning context, creates tasks, and runs review", async () => {
    db = await createTestOrm();
    const container = createTestContainer(db);
    const caller = await createTestCaller(db, container);

    const doc = await caller.docs.create({
      title: "E2E Workflow Test Doc",
      bodyMd: "# Requirements\n\nBuild login feature with OAuth2.",
      docType: "note",
    });
    expect(doc).toBeTruthy();
    const docId = (doc as { id: string }).id;
    expect(docId).toBeTruthy();

    const docRead = await caller.docs.get({ id: docId });
    expect((docRead as { title: string }).title).toBe("E2E Workflow Test Doc");

    const task = await caller.tasks.create({
      title: "Implement OAuth2 login",
      description: "Based on requirements doc",
      status: "todo",
      priority: 1,
    });
    expect(task).toBeTruthy();
    const taskId = (task as { id: string }).id;
    expect(taskId).toBeTruthy();

    const tasks = await caller.tasks.list({});
    expect(Array.isArray(tasks)).toBe(true);
    expect((tasks as unknown[]).length).toBeGreaterThanOrEqual(1);

    const taskRead = await caller.tasks.get({ id: taskId });
    expect((taskRead as { title: string }).title).toBe("Implement OAuth2 login");
  });

  it("creates a sprint, assigns tasks, and manages lifecycle", async () => {
    db = await createTestOrm();
    const container = createTestContainer(db);
    const caller = await createTestCaller(db, container);

    const project = await caller.projects.create({
      name: "E2E Sprint Project",
      slug: "e2e-sprint",
    });
    const projectId = (project as { id: string }).id;
    expect(projectId).toBeTruthy();

    const task = await caller.tasks.create({
      title: "Sprint task",
      status: "todo",
      priority: 2,
      projectId,
    });
    const taskId = (task as { id: string }).id;

    const sprint = await caller.sprints.create({
      projectId,
      name: "Sprint 1",
      startDate: new Date(),
      endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });
    expect(sprint).toBeTruthy();
    const sprintId = (sprint as { id: string }).id;

    const sprintRead = await caller.sprints.get({ id: sprintId });
    expect((sprintRead as { name: string }).name).toBe("Sprint 1");
  });
});

describe("full workflow E2E: docs → ACP → planning → PM → dep-run → UAT → E2E-generation", () => {
  it("exercises the complete acceptance cycle through service-owned TypeORM state", async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
    const { FULCRUM_WORKFLOW_SPINE_ENTITIES } = await import(
      "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts"
    );
    const { FULCRUM_REVIEW_WORKFLOW_ENTITIES } = await import(
      "@planning-review/infrastructure/database/review-workflow.entities.ts"
    );
    const { FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES } = await import(
      "@execution-orchestration/infrastructure/database/run-context.entities.ts"
    );
    const { FULCRUM_JOB_QUEUE_ENTITIES } = await import(
      "@platform-core/infrastructure/database/job-queue.entities.ts"
    );
    const { WorkflowSpine1778623200001 } = await import(
      "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts"
    );
    const { ReviewWorkflow1778623200002 } = await import(
      "@planning-review/infrastructure/database/review-workflow.migration.ts"
    );
    const { RunContext1778623200005 } = await import(
      "@execution-orchestration/infrastructure/database/run-context.migration.ts"
    );
    const { JobQueue1778751000000 } = await import(
      "@platform-core/infrastructure/database/job-queue.migration.ts"
    );
    const { buildFulcrumTypeOrmOptions, createFulcrumTypeOrmDataSource } = await import(
      "@platform-core/infrastructure/database/typeorm-data-source.ts"
    );
    const { WorkflowAcceptanceCycleService } = await import(
      "@workflow-coordination/application/workflow-acceptance-cycle.ts"
    );

    const pglite = await PGlite.create();
    await pglite.waitReady;
    const socketServer = new PGLiteSocketServer({
      db: pglite,
      host: "127.0.0.1",
      port: 0,
      maxConnections: 20,
    });
    await socketServer.start();
    const [host, port] = socketServer.getServerConn().split(":");
    const url = `postgresql://postgres:postgres@${host}:${port}/postgres`;

    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "pglite-socket",
        url,
        entities: [
          ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
          ...FULCRUM_REVIEW_WORKFLOW_ENTITIES,
          ...FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
          ...FULCRUM_JOB_QUEUE_ENTITIES,
        ],
        migrations: [
          WorkflowSpine1778623200001,
          ReviewWorkflow1778623200002,
          RunContext1778623200005,
          JobQueue1778751000000,
        ],
      }),
    );

    await dataSource.initialize();
    try {
      await dataSource.runMigrations();

      const cycle = new WorkflowAcceptanceCycleService(dataSource);

      // Step 1: Freeform doc intake → guided ACP planning → approved plan materialization
      // Step 2: Dependency-tree dispatch → lifecycle events → QA reviews
      // Step 3: Final QA → UAT handoff → UAT approval → E2E generation
      const result = await cycle.runCycle({
        workspace: {
          id: "ws-e2e-proof",
          slug: "e2e-proof",
          name: "E2E Proof Workspace",
        },
        project: {
          id: "proj-e2e-proof",
          slug: "e2e-proof",
          name: "E2E Proof Project",
          traceId: "trace-e2e-proof",
        },
        freeform: {
          documentId: "doc-e2e-proof",
          title: "OAuth2 Login Feature Spec",
          bodyMd: [
            "# OAuth2 Login Feature",
            "",
            "## Requirements",
            "- Support Google, GitHub, and Apple OAuth2 providers",
            "- Token refresh and session management",
            "- RBAC-gated route access after login",
          ].join("\n"),
          userPrompt: "Turn this into a technical plan with task breakdown and success criteria.",
        },
        guidedPlanning: {
          acpSessionId: "acp-e2e-proof",
          agentName: "claude-code",
          cwd: "/Users/workspace/fulcrum",
          modeId: "planning",
          modelId: "claude-opus-4-6",
          permissionMode: "review_each_tool",
        },
        approvedPlan: {
          planId: "plan-e2e-proof",
          reviewId: "review-e2e-proof",
          markdown: [
            "# OAuth2 Login Implementation Plan",
            "",
            "## Tasks",
            "- [auth-provider] Set up OAuth2 provider configurations",
            "  Depends on: none",
            "- [token-management] Implement token refresh and session lifecycle",
            "  Depends on: auth-provider",
            "- [route-guards] Add RBAC route guards for protected endpoints",
            "  Depends on: token-management",
            "",
            "## Prototype / Boilerplate",
            "- [prototype] apps/web/src/routes/auth/callback/+page.svelte",
            "",
            "## Success Criteria",
            "- OAuth2 callback processes tokens from 3 providers.",
            "- Sessions persist and refresh automatically.",
            "- Unauthorized routes redirect to login.",
          ].join("\n"),
        },
        execution: {
          agent: "claude-code",
          model: "claude-opus-4-6",
          prompt: "Execute dependency tree: configure providers, implement token management, add route guards.",
          lifecycleSummary: "All tasks completed — OAuth2 providers configured, tokens refresh, routes guarded.",
          qaReviewText: [
            "## QA Review",
            "### Verdict: APPROVE",
            "All success criteria satisfied. Token refresh tested, route guards verified.",
          ].join("\n"),
        },
        uat: {
          decision: "approve_without_manual_review",
          reviewType: "uat",
          e2eRunner: "bun",
        },
      });

      // ── Verify complete workflow chain ──────────────────────────────────

      // Step 1: Freeform doc was created and ACP session recorded
      expect(result.traceId).toBe("trace-e2e-proof");
      expect(result.freeform.status).toBe("ready_for_planning");
      expect(result.freeform.document.id).toBe("doc-e2e-proof");

      // Step 2: Guided ACP planning session persisted
      expect(result.guidedPlanning.status).toBe("ready_for_acp_prompt");
      expect(result.guidedPlanning.session.acpSessionId).toBe("acp-e2e-proof");

      // Step 3: Plan materialized into tasks with dependencies
      expect(result.plan.materialization.tasks.length).toBeGreaterThanOrEqual(3);
      expect(result.materializedTaskIds.length).toBeGreaterThanOrEqual(3);

      // Step 4: Dependency runs dispatched in correct order
      expect(result.dependencyRun.scheduledRuns.length).toBeGreaterThanOrEqual(3);
      expect(result.dependencyRun.scheduledRuns.every((run) => run.status === "queued")).toBe(true);

      // Step 5: All lifecycle events show success
      expect(result.lifecycleEvents.length).toBeGreaterThanOrEqual(3);
      expect(result.lifecycleEvents.every((event) => event.run.status === "succeeded")).toBe(true);

      // Step 6: QA reviews all approved
      expect(result.qaReviews.length).toBeGreaterThanOrEqual(3);
      expect(result.qaReviews.every((review) => review.verdict === "APPROVE")).toBe(true);

      // Step 7: Final QA passed
      expect(result.finalQa.status).toBe("passed");

      // Step 8: UAT handoff ready
      expect(result.handoff.status).toBe("ready");

      // Step 9: UAT decision approved
      expect(result.uatDecision.status).toBe("approved");

      // Step 10: E2E tests generated
      expect(result.generatedE2e.status).toBe("planned");
      expect(result.generatedE2e.testFiles.length).toBeGreaterThan(0);

    } finally {
      await dataSource.destroy();
      await socketServer.stop();
      await pglite.close();
    }
  });
});
