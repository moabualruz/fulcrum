import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import {
  FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
  FulcrumRunEventEntity,
} from "@execution-orchestration/infrastructure/database/run-context.entities.ts";
import {
  FULCRUM_REVIEW_WORKFLOW_ENTITIES,
  FulcrumArtifactEntity,
  FulcrumGeneratedE2ETestEntity,
  FulcrumReviewAnnotationEntity,
  FulcrumReviewSessionEntity,
  FulcrumUatSessionEntity,
} from "@planning-review/infrastructure/database/review-workflow.entities.ts";
import {
  FulcrumAgentRunEntity,
  FulcrumDocumentEntity,
  FulcrumProjectEntity,
  FulcrumTaskEntity,
  FulcrumWorkspaceEntity,
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { RunContext1778623200005 } from "@execution-orchestration/infrastructure/database/run-context.migration.ts";
import { ReviewWorkflow1778623200002 } from "@planning-review/infrastructure/database/review-workflow.migration.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";
import {
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { ReviewWorkbenchService } from "@workflow-coordination/application/review-workbench.service.ts";

let pglite: PGlite | undefined;
let socketServer: PGLiteSocketServer | undefined;

async function startPgliteSocket(): Promise<string> {
  pglite = await PGlite.create();
  await pglite.waitReady;

  socketServer = new PGLiteSocketServer({
    db: pglite,
    host: "127.0.0.1",
    port: 0,
    maxConnections: 20,
  });
  await socketServer.start();

  const [host, port] = socketServer.getServerConn().split(":");
  return `postgresql://postgres:postgres@${host}:${port}/postgres`;
}

afterEach(async () => {
  if (socketServer) {
    await socketServer.stop();
    socketServer = undefined;
  }
  if (pglite) {
    await pglite.close();
    pglite = undefined;
  }
});

describe("Review workbench Nest service", () => {
  test("saves and loads review workbench sessions through TypeORM rows", async () => {
    const url = await startPgliteSocket();
    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "pglite-socket",
        url,
        entities: [...FULCRUM_WORKFLOW_SPINE_ENTITIES,...FULCRUM_REVIEW_WORKFLOW_ENTITIES,...FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
        ],
        migrations: [
          WorkflowSpine1778623200001,
          ReviewWorkflow1778623200002,
          RunContext1778623200005,
        ],
      }),);

    await dataSource.initialize();
    try {
      await dataSource.runMigrations();
      const service = new ReviewWorkbenchService(dataSource);
      const saved = await service.saveReviewWorkbenchSession({
        workspaceId: "workspace-session-nest",
        workspaceSlug: "session-nest",
        workspaceName: "Session Nest",
        projectId: "project-session-nest",
        projectSlug: "session-nest",
        projectName: "Session Nest Project",
        traceId: "trace-session-nest",
        reviewId: "review-session-nest",
        reviewType: "code_review",
        title: "Persisted review session",
        files: [{
          path: "src/app/main.ts",
          patch: [
            "diff --git a/src/app/main.ts b/src/app/main.ts",
            "@@ -1,2 +1,2 @@",
            '-  return "old";',
            '+  return traceId;',
          ].join("\n"),
          additions: 1,
          deletions: 1,
        }],
        annotations: [{
          id: "annotation-session-nest",
          type: "suggestion",
          filePath: "src/app/main.ts",
          lineStart: 2,
          lineEnd: 2,
          side: "new",
          text: "Use the trace-linked value.",
          originalCode: 'return "old";',
          suggestedCode: "return traceId;",
          createdAt: 1,
        }],
        selectedFilePath: "src/app/main.ts",
        searchQuery: "trace",
        liveLog: { content: "review session log", isLive: false },
      });
      const secondSave = await service.saveReviewWorkbenchSession({
        workspaceId: "workspace-session-nest",
        workspaceSlug: "session-nest",
        workspaceName: "Session Nest",
        projectId: "project-session-nest",
        projectSlug: "session-nest",
        projectName: "Session Nest Project",
        traceId: "trace-session-nest",
        reviewId: "review-session-nest",
        reviewType: "code_review",
        title: "Persisted review session",
        files: [{
          path: "src/app/main.ts",
          patch: [
            "diff --git a/src/app/main.ts b/src/app/main.ts",
            "@@ -1,2 +1,2 @@",
            '-  return "old";',
            '+  return traceId;',
          ].join("\n"),
          additions: 1,
          deletions: 1,
        }],
        annotations: [],
        selectedFilePath: "src/app/main.ts",
        searchQuery: "trace",
      });

      expect(saved).toMatchObject({
        projectId: "project-session-nest",
        traceId: "trace-session-nest",
        reviewId: "review-session-nest",
        reviewType: "code_review",
        title: "Persisted review session",
        status: "saved",
        revision: 1,
      });
      expect(saved.model.summary).toMatchObject({
        fileCount: 1,
        annotationCount: 1,
        searchMatchCount: 1,
        hasLiveOutput: true,
      });
      expect(secondSave.revision).toBe(2);

      const loaded = await service.loadReviewWorkbenchSession({
        workspaceId: "workspace-session-nest",
        workspaceSlug: "session-nest",
        workspaceName: "Session Nest",
        projectId: "project-session-nest",
        projectSlug: "session-nest",
        projectName: "Session Nest Project",
        reviewId: "review-session-nest",
        searchQuery: "trace",
      });
      expect(loaded).toMatchObject({
        projectId: "project-session-nest",
        traceId: "trace-session-nest",
        reviewId: "review-session-nest",
        reviewType: "code_review",
        title: "Persisted review session",
        status: "loaded",
        revision: 2,
      });
      expect(loaded.model.selectedFile?.path).toBe("src/app/main.ts");
      expect(loaded.model.summary.searchMatchCount).toBe(1);

      await expect(dataSource.getRepository(FulcrumReviewSessionEntity).findOneByOrFail({
        id: "review-session-nest",
      })).resolves.toMatchObject({
        projectId: "project-session-nest",
        traceId: "trace-session-nest",
        reviewType: "code_review",
        status: "saved",
        revision: 2,
      });
      await expect(dataSource.getRepository(FulcrumReviewAnnotationEntity).findOneByOrFail({
        id: "annotation-session-nest",
      })).resolves.toMatchObject({
        reviewSessionId: "review-session-nest",
        filePath: "src/app/main.ts",
        lineStart: 2,
        lineEnd: 2,
        severity: "suggestion",
        body: "Use the trace-linked value.",
        status: "open",
      });
    } finally {
      await dataSource.destroy();
    }
  });

  test("appends a inline annotation as a new persisted TypeORM review-session revision", async () => {
    const url = await startPgliteSocket();
    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "pglite-socket",
        url,
        entities: [...FULCRUM_WORKFLOW_SPINE_ENTITIES,...FULCRUM_REVIEW_WORKFLOW_ENTITIES,...FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
        ],
        migrations: [
          WorkflowSpine1778623200001,
          ReviewWorkflow1778623200002,
          RunContext1778623200005,
        ],
      }),);

    await dataSource.initialize();
    try {
      await dataSource.runMigrations();
      const service = new ReviewWorkbenchService(dataSource);
      await service.saveReviewWorkbenchSession({
        workspaceId: "workspace-annotate-nest",
        workspaceSlug: "annotate-nest",
        workspaceName: "Annotate Nest",
        projectId: "project-annotate-nest",
        projectSlug: "annotate-nest",
        projectName: "Annotate Nest Project",
        traceId: "trace-annotate-nest",
        reviewId: "review-annotate-nest",
        reviewType: "code_review",
        title: "Annotation review session",
        files: [{
          path: "src/review/app.ts",
          patch: [
            "diff --git a/src/review/app.ts b/src/review/app.ts",
            "@@ -1,2 +1,2 @@",
            "-const trace = oldTrace;",
            "+const trace = acceptedTrace;",
          ].join("\n"),
          additions: 1,
          deletions: 1,
        }],
        annotations: [],
        selectedFilePath: "src/review/app.ts",
        searchQuery: "accepted",
      });

      const annotated = await service.appendReviewWorkbenchAnnotation({
        workspaceId: "workspace-annotate-nest",
        workspaceSlug: "annotate-nest",
        workspaceName: "Annotate Nest",
        projectId: "project-annotate-nest",
        projectSlug: "annotate-nest",
        projectName: "Annotate Nest Project",
        reviewId: "review-annotate-nest",
        annotationId: "annotation-inline-nest",
        type: "suggestion",
        filePath: "src/review/app.ts",
        lineStart: 1,
        lineEnd: 2,
        side: "new",
        text: "Inline review feedback should persist through the Nest API.",
        originalCode: "const trace = oldTrace;",
        suggestedCode: "const trace = acceptedTrace;",
        searchQuery: "feedback",
      });

      expect(annotated).toMatchObject({
        projectId: "project-annotate-nest",
        traceId: "trace-annotate-nest",
        reviewId: "review-annotate-nest",
        reviewType: "code_review",
        title: "Annotation review session",
        status: "annotated",
        revision: 2,
      });
      expect(annotated.model.summary).toMatchObject({
        annotationCount: 1,
        suggestionCount: 1,
      });
      expect(annotated.model.annotationGroups[0]?.annotations[0]).toMatchObject({
        id: "annotation-inline-nest",
        filePath: "src/review/app.ts",
        lineStart: 1,
        lineEnd: 2,
        text: "Inline review feedback should persist through the Nest API.",
        suggestedCode: "const trace = acceptedTrace;",
      });
      expect(annotated.model.search.query).toBe("feedback");

      const loaded = await service.loadReviewWorkbenchSession({
        workspaceId: "workspace-annotate-nest",
        workspaceSlug: "annotate-nest",
        workspaceName: "Annotate Nest",
        projectId: "project-annotate-nest",
        projectSlug: "annotate-nest",
        projectName: "Annotate Nest Project",
        reviewId: "review-annotate-nest",
      });
      expect(loaded.revision).toBe(2);
      expect(loaded.model.summary.annotationCount).toBe(1);
      expect(loaded.model.annotationGroups[0]?.annotations[0]?.id).toBe("annotation-inline-nest");

      await expect(dataSource.getRepository(FulcrumReviewSessionEntity).findOneByOrFail({
        id: "review-annotate-nest",
      })).resolves.toMatchObject({
        projectId: "project-annotate-nest",
        traceId: "trace-annotate-nest",
        reviewType: "code_review",
        status: "annotated",
        revision: 2,
      });
      await expect(dataSource.getRepository(FulcrumReviewAnnotationEntity).findOneByOrFail({
        id: "annotation-inline-nest",
      })).resolves.toMatchObject({
        reviewSessionId: "review-annotate-nest",
        filePath: "src/review/app.ts",
        lineStart: 1,
        lineEnd: 2,
        severity: "suggestion",
        body: "Inline review feedback should persist through the Nest API.",
        status: "open",
      });
    } finally {
      await dataSource.destroy();
    }
  });

  test("builds final QA reports from TypeORM workflow rows and records the audit event", async () => {
    const url = await startPgliteSocket();
    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "pglite-socket",
        url,
        entities: [...FULCRUM_WORKFLOW_SPINE_ENTITIES,...FULCRUM_REVIEW_WORKFLOW_ENTITIES,...FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
        ],
        migrations: [
          WorkflowSpine1778623200001,
          ReviewWorkflow1778623200002,
          RunContext1778623200005,
        ],
      }),);

    await dataSource.initialize();
    try {
      await dataSource.runMigrations();
      await dataSource.getRepository(FulcrumWorkspaceEntity).save({
        id: "workspace-finalqa-nest",
        slug: "finalqa-nest",
        name: "Final QA Nest",
      });
      await dataSource.getRepository(FulcrumProjectEntity).save({
        id: "project-finalqa-nest",
        workspaceId: "workspace-finalqa-nest",
        slug: "finalqa-nest",
        name: "Final QA Nest Project",
        traceId: "trace-finalqa-nest",
      });
      await dataSource.getRepository(FulcrumDocumentEntity).save({
        id: "doc-finalqa-nest",
        projectId: "project-finalqa-nest",
        title: "Approved release plan",
        bodyMd: "Trace trace-finalqa-nest covers final QA success criteria.",
        sourceType: "plan",
        traceId: "trace-finalqa-nest",
      });
      await dataSource.getRepository(FulcrumTaskEntity).save({
        id: "task-finalqa-nest",
        projectId: "project-finalqa-nest",
        title: "Release final QA path",
        status: "in-review",
        successCriteria: ["Final QA passes before UAT handoff."],
        traceId: "trace-finalqa-nest",
      });
      await dataSource.getRepository(FulcrumAgentRunEntity).save({
        id: "run-finalqa-nest-task",
        projectId: "project-finalqa-nest",
        taskId: "task-finalqa-nest",
        traceId: "trace-finalqa-nest",
        status: "succeeded",
        dependencyTree: [],
      });
      await dataSource.getRepository(FulcrumArtifactEntity).save({
        id: "artifact-finalqa-nest",
        projectId: "project-finalqa-nest",
        traceId: "trace-finalqa-nest",
        kind: "prototype",
        title: "Final QA proof",
        bodyPath: "/tmp/final-qa-proof.md",
        checksumSha256: null,
      });
      await dataSource.getRepository(FulcrumRunEventEntity).save({
        id: "event-finalqa-nest-approved",
        projectId: "project-finalqa-nest",
        runId: "run-finalqa-nest-task",
        taskId: "task-finalqa-nest",
        traceId: "trace-finalqa-nest",
        sequence: 1,
        domain: "review",
        mutationType: "qa_review_recorded",
        targetKind: "task",
        targetId: "task-finalqa-nest",
        agentId: "qa-reviewer",
        taskLineageId: "trace-finalqa-nest",
        payload: {
          verdict: "APPROVE",
          nextAction: "ready_for_final_review",
          successCriteria: ["Final QA passes before UAT handoff."],
        },
      });

      const service = new ReviewWorkbenchService(dataSource);
      const report = await service.buildFinalQaReport({
        workspaceId: "workspace-finalqa-nest",
        workspaceSlug: "finalqa-nest",
        workspaceName: "Final QA Nest",
        projectId: "project-finalqa-nest",
        projectSlug: "finalqa-nest",
        projectName: "Final QA Nest Project",
        traceId: "trace-finalqa-nest",
        taskIds: ["task-finalqa-nest"],
      });

      expect(report).toMatchObject({
        projectId: "project-finalqa-nest",
        traceId: "trace-finalqa-nest",
        status: "passed",
        readyForUserAcceptance: true,
        nextAction: "prompt_uat_code_review",
      });
      expect(report.summary).toMatchObject({
        taskCount: 1,
        docCount: 1,
        runCount: 1,
        artifactCount: 1,
        successCriteriaCount: 1,
        approvedTaskCount: 1,
        blockedTaskCount: 0,
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
      expect(report.taskResults).toEqual([
        expect.objectContaining({
          taskId: "task-finalqa-nest",
          latestVerdict: "APPROVE",
          latestReviewEventId: "event-finalqa-nest-approved",
          successCriteria: ["Final QA passes before UAT handoff."],
          runIds: ["run-finalqa-nest-task"],
          openFeedbackRunIds: [],
          artifactIds: ["artifact-finalqa-nest"],
        }),
      ]);
      expect(report.markdown).toContain("# Final QA Report");
      expect(report.markdown).toContain("Status: passed");

      const finalQaEvent = await dataSource.getRepository(FulcrumRunEventEntity).findOneByOrFail({
        runId: "run-finalqa-nest-task",
        sequence: 2,
      });
      expect(finalQaEvent).toMatchObject({
        projectId: "project-finalqa-nest",
        traceId: "trace-finalqa-nest",
        domain: "review",
        mutationType: "final_qa_completed",
        targetKind: "project",
        targetId: "project-finalqa-nest",
      });
      expect(finalQaEvent.payload).toMatchObject({
        status: "passed",
        nextAction: "prompt_uat_code_review",
        taskIds: ["task-finalqa-nest"],
      });
    } finally {
      await dataSource.destroy();
    }
  });

  test("builds UAT/code-review handoffs from passed final QA and persists review sessions", async () => {
    const url = await startPgliteSocket();
    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "pglite-socket",
        url,
        entities: [...FULCRUM_WORKFLOW_SPINE_ENTITIES,...FULCRUM_REVIEW_WORKFLOW_ENTITIES,...FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
        ],
        migrations: [
          WorkflowSpine1778623200001,
          ReviewWorkflow1778623200002,
          RunContext1778623200005,
        ],
      }),);

    await dataSource.initialize();
    try {
      await dataSource.runMigrations();
      await dataSource.getRepository(FulcrumWorkspaceEntity).save({
        id: "workspace-uat-nest",
        slug: "uat-nest",
        name: "UAT Nest",
      });
      await dataSource.getRepository(FulcrumProjectEntity).save({
        id: "project-uat-nest",
        workspaceId: "workspace-uat-nest",
        slug: "uat-nest",
        name: "UAT Nest Project",
        traceId: "trace-uat-nest",
      });
      await dataSource.getRepository(FulcrumDocumentEntity).save({
        id: "doc-uat-nest",
        projectId: "project-uat-nest",
        title: "Approved UAT plan",
        bodyMd: "Trace trace-uat-nest is ready for UAT.",
        sourceType: "plan",
        traceId: "trace-uat-nest",
      });
      await dataSource.getRepository(FulcrumTaskEntity).save({
        id: "task-uat-nest",
        projectId: "project-uat-nest",
        title: "Prompt user for UAT",
        status: "in-review",
        successCriteria: ["User gets UAT and code-review choices after final QA."],
        traceId: "trace-uat-nest",
      });
      await dataSource.getRepository(FulcrumAgentRunEntity).save({
        id: "run-uat-nest-task",
        projectId: "project-uat-nest",
        taskId: "task-uat-nest",
        traceId: "trace-uat-nest",
        status: "succeeded",
        dependencyTree: [],
      });
      await dataSource.getRepository(FulcrumArtifactEntity).save({
        id: "artifact-uat-nest",
        projectId: "project-uat-nest",
        traceId: "trace-uat-nest",
        kind: "uat-proof",
        title: "UAT proof",
        bodyPath: "/tmp/uat-proof.md",
        checksumSha256: null,
      });
      await dataSource.getRepository(FulcrumRunEventEntity).save({
        id: "event-uat-nest-approved",
        projectId: "project-uat-nest",
        runId: "run-uat-nest-task",
        taskId: "task-uat-nest",
        traceId: "trace-uat-nest",
        sequence: 1,
        domain: "review",
        mutationType: "qa_review_recorded",
        targetKind: "task",
        targetId: "task-uat-nest",
        agentId: "qa-reviewer",
        taskLineageId: "trace-uat-nest",
        payload: {
          verdict: "APPROVE",
          nextAction: "ready_for_final_review",
          successCriteria: ["User gets UAT and code-review choices after final QA."],
        },
      });

      const service = new ReviewWorkbenchService(dataSource);
      const handoff = await service.buildUatCodeReviewHandoff({
        workspaceId: "workspace-uat-nest",
        workspaceSlug: "uat-nest",
        workspaceName: "UAT Nest",
        projectId: "project-uat-nest",
        projectSlug: "uat-nest",
        projectName: "UAT Nest Project",
        traceId: "trace-uat-nest",
        taskIds: ["task-uat-nest"],
      });

      expect(handoff).toMatchObject({
        projectId: "project-uat-nest",
        traceId: "trace-uat-nest",
        status: "ready",
        finalQaStatus: "passed",
        nextAction: "prompt_user_for_uat_code_review",
        eventId: "event-trace-uat-nest-uat-code-review-prompted",
      });
      expect(handoff.reviewSessions.map((session) => [session.id, session.type, session.status])).toEqual([
        ["uat-trace-uat-nest", "uat", "pending_user_decision"],
        ["code-review-trace-uat-nest", "code_review", "pending_user_decision"],
      ]);
      expect(handoff.decisionOptions.map((option) => option.id)).toEqual([
        "start_uat",
        "start_code_review",
        "request_changes",
        "approve_without_manual_review",
      ]);
      expect(handoff.promptMarkdown).toContain("# UAT And Code Review Handoff");
      expect(handoff.promptMarkdown).toContain("prompt_user_for_uat_code_review");

      await expect(dataSource.getRepository(FulcrumUatSessionEntity).findOneByOrFail({
        id: "uat-trace-uat-nest",
      })).resolves.toMatchObject({
        projectId: "project-uat-nest",
        traceId: "trace-uat-nest",
        status: "pending_user_decision",
      });
      await expect(dataSource.getRepository(FulcrumReviewSessionEntity).findOneByOrFail({
        id: "code-review-trace-uat-nest",
      })).resolves.toMatchObject({
        projectId: "project-uat-nest",
        traceId: "trace-uat-nest",
        reviewType: "code_review",
        status: "pending_user_decision",
        revision: 1,
      });

      const handoffEvent = await dataSource.getRepository(FulcrumRunEventEntity).findOneByOrFail({
        id: "event-trace-uat-nest-uat-code-review-prompted",
      });
      expect(handoffEvent).toMatchObject({
        projectId: "project-uat-nest",
        runId: "run-uat-nest-task",
        traceId: "trace-uat-nest",
        sequence: 2,
        domain: "review",
        mutationType: "uat_code_review_prompted",
        targetKind: "project",
        targetId: "project-uat-nest",
      });
      expect(handoffEvent.payload).toMatchObject({
        status: "ready",
        finalQaStatus: "passed",
        nextAction: "prompt_user_for_uat_code_review",
        reviewSessionIds: ["uat-trace-uat-nest", "code-review-trace-uat-nest"],
        taskIds: ["task-uat-nest"],
      });
    } finally {
      await dataSource.destroy();
    }
  });

  test("records approved UAT/code-review decisions and generates TypeORM E2E rows", async () => {
    const url = await startPgliteSocket();
    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "pglite-socket",
        url,
        entities: [...FULCRUM_WORKFLOW_SPINE_ENTITIES,...FULCRUM_REVIEW_WORKFLOW_ENTITIES,...FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
        ],
        migrations: [
          WorkflowSpine1778623200001,
          ReviewWorkflow1778623200002,
          RunContext1778623200005,
        ],
      }),);

    await dataSource.initialize();
    try {
      await dataSource.runMigrations();
      await dataSource.getRepository(FulcrumWorkspaceEntity).save({
        id: "workspace-decision-nest",
        slug: "decision-nest",
        name: "Decision Nest",
      });
      await dataSource.getRepository(FulcrumProjectEntity).save({
        id: "project-decision-nest",
        workspaceId: "workspace-decision-nest",
        slug: "decision-nest",
        name: "Decision Nest Project",
        traceId: "trace-decision-nest",
      });
      await dataSource.getRepository(FulcrumDocumentEntity).save({
        id: "doc-decision-nest",
        projectId: "project-decision-nest",
        title: "Approved decision plan",
        bodyMd: "Trace trace-decision-nest can generate real-data E2E.",
        sourceType: "plan",
        traceId: "trace-decision-nest",
      });
      await dataSource.getRepository(FulcrumTaskEntity).save({
        id: "task-decision-nest",
        projectId: "project-decision-nest",
        title: "Generate accepted regression",
        status: "in-review",
        successCriteria: ["Accepted UAT generates a regression test row."],
        traceId: "trace-decision-nest",
      });
      await dataSource.getRepository(FulcrumAgentRunEntity).save({
        id: "run-decision-nest-task",
        projectId: "project-decision-nest",
        taskId: "task-decision-nest",
        traceId: "trace-decision-nest",
        status: "succeeded",
        dependencyTree: [],
      });
      await dataSource.getRepository(FulcrumArtifactEntity).save({
        id: "artifact-decision-nest",
        projectId: "project-decision-nest",
        traceId: "trace-decision-nest",
        kind: "uat-proof",
        title: "Decision proof",
        bodyPath: "/tmp/decision-proof.md",
        checksumSha256: null,
      });
      await dataSource.getRepository(FulcrumRunEventEntity).save({
        id: "event-decision-nest-approved",
        projectId: "project-decision-nest",
        runId: "run-decision-nest-task",
        taskId: "task-decision-nest",
        traceId: "trace-decision-nest",
        sequence: 1,
        domain: "review",
        mutationType: "qa_review_recorded",
        targetKind: "task",
        targetId: "task-decision-nest",
        agentId: "qa-reviewer",
        taskLineageId: "trace-decision-nest",
        payload: {
          verdict: "APPROVE",
          nextAction: "ready_for_final_review",
          successCriteria: ["Accepted UAT generates a regression test row."],
        },
      });

      const service = new ReviewWorkbenchService(dataSource);
      const decision = await service.recordUatCodeReviewDecision({
        workspaceId: "workspace-decision-nest",
        workspaceSlug: "decision-nest",
        workspaceName: "Decision Nest",
        projectId: "project-decision-nest",
        projectSlug: "decision-nest",
        projectName: "Decision Nest Project",
        traceId: "trace-decision-nest",
        taskIds: ["task-decision-nest"],
        decision: "approve_without_manual_review",
        reviewType: "uat",
        e2eRunner: "bun",
      });

      expect(decision).toMatchObject({
        projectId: "project-decision-nest",
        traceId: "trace-decision-nest",
        decision: "approve_without_manual_review",
        reviewType: "uat",
        status: "approved",
        nextAction: "real_data_e2e_generated",
        eventId: "event-trace-decision-nest-uat-code-review-decision-recorded-approve-without-manual-review",
      });
      expect(decision.generatedE2eTests).toEqual([
        expect.objectContaining({
          artifactId: "e2e-trace-decision-nest-task-decision-nest",
          runner: "bun",
          sourceTaskIds: ["task-decision-nest"],
          sourceCriteria: ["Accepted UAT generates a regression test row."],
        }),
      ]);
      expect(decision.generatedE2eTests[0]?.body).toContain("Accepted UAT generates a regression test row.");

      await expect(dataSource.getRepository(FulcrumUatSessionEntity).findOneByOrFail({
        id: "uat-trace-decision-nest",
      })).resolves.toMatchObject({
        projectId: "project-decision-nest",
        traceId: "trace-decision-nest",
        status: "approved",
      });
      await expect(dataSource.getRepository(FulcrumGeneratedE2ETestEntity).findOneByOrFail({
        id: "e2e-trace-decision-nest-task-decision-nest",
      })).resolves.toMatchObject({
        projectId: "project-decision-nest",
        traceId: "trace-decision-nest",
        sourceUatSessionId: "uat-trace-decision-nest",
        runner: "bun",
        status: "accepted",
      });

      const decisionEvent = await dataSource.getRepository(FulcrumRunEventEntity).findOneByOrFail({
        id: "event-trace-decision-nest-uat-code-review-decision-recorded-approve-without-manual-review",
      });
      expect(decisionEvent).toMatchObject({
        projectId: "project-decision-nest",
        runId: "run-decision-nest-task",
        traceId: "trace-decision-nest",
        sequence: 3,
        domain: "review",
        mutationType: "uat_code_review_decision_recorded",
        targetKind: "project",
        targetId: "project-decision-nest",
      });
      expect(decisionEvent.payload).toMatchObject({
        decision: "approve_without_manual_review",
        reviewType: "uat",
        status: "approved",
        nextAction: "real_data_e2e_generated",
        generatedE2eArtifactIds: ["e2e-trace-decision-nest-task-decision-nest"],
      });
    } finally {
      await dataSource.destroy();
    }
  });

  test("applies configured UAT/code-review auto-decisions and plans generated E2E runs through TypeORM rows", async () => {
    const url = await startPgliteSocket();
    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "pglite-socket",
        url,
        entities: [...FULCRUM_WORKFLOW_SPINE_ENTITIES,...FULCRUM_REVIEW_WORKFLOW_ENTITIES,...FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
        ],
        migrations: [
          WorkflowSpine1778623200001,
          ReviewWorkflow1778623200002,
          RunContext1778623200005,
        ],
      }),);

    await dataSource.initialize();
    try {
      await dataSource.runMigrations();
      await dataSource.query(`
        CREATE TABLE tenant_settings (
          id varchar(128) PRIMARY KEY,
          org_id varchar(128) NOT NULL,
          key varchar(240) NOT NULL,
          value jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT tenant_settings_org_key_unique UNIQUE (org_id, key))
      `);
      await dataSource.query(
        `INSERT INTO tenant_settings (id, org_id, key, value)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [
          "setting-auto-nest",
          "workspace-auto-nest",
          "reports.uatCodeReviewAutoDecision",
          JSON.stringify({
            enabled: true,
            decision: "approve_without_manual_review",
            reviewType: "uat",
            e2eRunner: "bun",
            taskIds: ["task-auto-nest"],
          }),
        ],);
      await dataSource.getRepository(FulcrumWorkspaceEntity).save({
        id: "workspace-auto-nest",
        slug: "auto-nest",
        name: "Auto Nest",
      });
      await dataSource.getRepository(FulcrumProjectEntity).save({
        id: "project-auto-nest",
        workspaceId: "workspace-auto-nest",
        slug: "auto-nest",
        name: "Auto Nest Project",
        traceId: "trace-auto-nest",
      });
      await dataSource.getRepository(FulcrumDocumentEntity).save({
        id: "doc-auto-nest",
        projectId: "project-auto-nest",
        title: "Approved auto decision plan",
        bodyMd: "Trace trace-auto-nest can auto-approve UAT and plan generated E2E.",
        sourceType: "plan",
        traceId: "trace-auto-nest",
      });
      await dataSource.getRepository(FulcrumTaskEntity).save({
        id: "task-auto-nest",
        projectId: "project-auto-nest",
        title: "Auto approve and run generated regression",
        status: "in-review",
        successCriteria: ["Configured approval generates and plans a regression test."],
        traceId: "trace-auto-nest",
      });
      await dataSource.getRepository(FulcrumAgentRunEntity).save({
        id: "run-auto-nest-task",
        projectId: "project-auto-nest",
        taskId: "task-auto-nest",
        traceId: "trace-auto-nest",
        status: "succeeded",
        dependencyTree: [],
      });
      await dataSource.getRepository(FulcrumArtifactEntity).save({
        id: "artifact-auto-nest",
        projectId: "project-auto-nest",
        traceId: "trace-auto-nest",
        kind: "uat-proof",
        title: "Auto decision proof",
        bodyPath: "/tmp/auto-proof.md",
        checksumSha256: null,
      });
      await dataSource.getRepository(FulcrumRunEventEntity).save({
        id: "event-auto-nest-approved",
        projectId: "project-auto-nest",
        runId: "run-auto-nest-task",
        taskId: "task-auto-nest",
        traceId: "trace-auto-nest",
        sequence: 1,
        domain: "review",
        mutationType: "qa_review_recorded",
        targetKind: "task",
        targetId: "task-auto-nest",
        agentId: "qa-reviewer",
        taskLineageId: "trace-auto-nest",
        payload: {
          verdict: "APPROVE",
          nextAction: "ready_for_final_review",
          successCriteria: ["Configured approval generates and plans a regression test."],
        },
      });

      const service = new ReviewWorkbenchService(dataSource);
      const autoDecision = await service.applyConfiguredUatCodeReviewDecision({
        workspaceId: "workspace-auto-nest",
        workspaceSlug: "auto-nest",
        workspaceName: "Auto Nest",
        projectId: "project-auto-nest",
        projectSlug: "auto-nest",
        projectName: "Auto Nest Project",
        traceId: "trace-auto-nest",
      });

      expect(autoDecision).toMatchObject({
        projectId: "project-auto-nest",
        traceId: "trace-auto-nest",
        settingKey: "reports.uatCodeReviewAutoDecision",
        status: "applied",
        nextAction: "real_data_e2e_generated",
        config: {
          enabled: true,
          decision: "approve_without_manual_review",
          reviewType: "uat",
          e2eRunner: "bun",
          taskIds: ["task-auto-nest"],
        },
        decision: {
          status: "approved",
          generatedE2eTests: [{
            artifactId: "e2e-trace-auto-nest-task-auto-nest",
          }],
        },
      });

      const run = await service.runGeneratedE2eRegressionTests({
        workspaceId: "workspace-auto-nest",
        workspaceSlug: "auto-nest",
        workspaceName: "Auto Nest",
        projectId: "project-auto-nest",
        projectSlug: "auto-nest",
        projectName: "Auto Nest Project",
        traceId: "trace-auto-nest",
        runner: "bun",
        planOnly: true,
      });

      expect(run).toMatchObject({
        projectId: "project-auto-nest",
        traceId: "trace-auto-nest",
        runner: "bun",
        status: "planned",
        artifactIds: ["e2e-trace-auto-nest-task-auto-nest"],
        stdout: "",
        stderr: "",
        exitCode: null,
        ciCommand: ["bun", "run", "scripts/ci-generated-e2e.ts"],
      });
      expect(run.command[0]).toBe("bun");
      expect(run.command[1]).toBe("test");
      expect(run.testFiles).toHaveLength(1);
      await expect(readFile(run.testFiles[0]!, "utf8")).resolves.toContain(
        "Configured approval generates and plans a regression test.",);

      const runEvent = await dataSource.getRepository(FulcrumRunEventEntity).findOneByOrFail({
        id: "event-trace-auto-nest-generated-e2e-regression-run-completed-bun",
      });
      expect(runEvent).toMatchObject({
        projectId: "project-auto-nest",
        runId: "run-trace-auto-nest-generated-e2e-bun",
        traceId: "trace-auto-nest",
        domain: "review",
        mutationType: "generated_e2e_regression_run_completed",
        targetKind: "project",
        targetId: "project-auto-nest",
      });
      expect(runEvent.payload).toMatchObject({
        runner: "bun",
        status: "planned",
        artifactIds: ["e2e-trace-auto-nest-task-auto-nest"],
      });
    } finally {
      await dataSource.destroy();
    }
  });
});
