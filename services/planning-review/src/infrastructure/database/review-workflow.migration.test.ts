import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import {
  FULCRUM_REVIEW_WORKFLOW_ENTITIES,
  FulcrumArtifactEntity,
  FulcrumGeneratedE2ETestEntity,
  FulcrumPlanEntity,
  FulcrumPlanPrototypeEntity,
  FulcrumReviewAnnotationEntity,
  FulcrumReviewSessionEntity,
  FulcrumUatSessionEntity,
} from "@planning-review/infrastructure/database/review-workflow.entities.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
  FulcrumProjectEntity,
  FulcrumTaskEntity,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { ReviewWorkflow1778623200002 } from "@planning-review/infrastructure/database/review-workflow.migration.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";
import {
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";

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

describe("TypeORM review workflow migration", () => {
  test("persists planning prototypes, reviews, UAT, and generated E2E through PGlite socket", async () => {
    const url = await startPgliteSocket();
    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "pglite-socket",
        url,
        entities: [
          ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
          ...FULCRUM_REVIEW_WORKFLOW_ENTITIES,
        ],
        migrations: [WorkflowSpine1778623200001, ReviewWorkflow1778623200002],
      }),
    );

    await dataSource.initialize();
    try {
      const migrations = await dataSource.runMigrations();
      expect(migrations.map((migration) => migration.name)).toEqual([
        "WorkflowSpine1778623200001",
        "ReviewWorkflow1778623200002",
      ]);

      await dataSource.getRepository(FulcrumWorkspaceEntity).save({
        id: "workspace-review-loop",
        slug: "review-loop",
        name: "Review loop workspace",
      });
      await dataSource.getRepository(FulcrumProjectEntity).save({
        id: "project-review-loop",
        workspaceId: "workspace-review-loop",
        slug: "review-loop",
        name: "Review Loop",
        traceId: "trace-review-loop",
      });
      await dataSource.getRepository(FulcrumTaskEntity).save({
        id: "task-review-loop",
        projectId: "project-review-loop",
        title: "Close review loop",
        status: "in_review",
        successCriteria: ["UAT approved", "E2E generated"],
        traceId: "trace-review-loop",
      });

      await dataSource.getRepository(FulcrumArtifactEntity).save({
        id: "artifact-prototype",
        projectId: "project-review-loop",
        traceId: "trace-review-loop",
        kind: "prototype",
        title: "Planning prototype",
        filename: "prototype.md",
        bodyPath: "artifacts/prototype.md",
        checksumSha256: "sha256-prototype",
        mime: "text/markdown",
        sizeBytes: "42",
        lifecycleState: "pending_review",
        archived: false,
        metadataJson: {
          sourceKind: "prototype",
          sourceId: "plan-review-loop",
        },
      });
      await dataSource.getRepository(FulcrumPlanEntity).save({
        id: "plan-review-loop",
        projectId: "project-review-loop",
        traceId: "trace-review-loop",
        title: "Technical plan",
        planMd: "# Plan\nBuild prototype first.",
        status: "approved",
        sourceDocId: null,
      });
      await dataSource.getRepository(FulcrumPlanPrototypeEntity).save({
        id: "prototype-review-loop",
        planId: "plan-review-loop",
        artifactId: "artifact-prototype",
        kind: "boilerplate",
        title: "Prototype shell",
        status: "approved",
        outputRef: "artifacts/prototype.md",
        metadata: { reviewed: true },
      });
      await dataSource.getRepository(FulcrumReviewSessionEntity).save({
        id: "review-session-code",
        projectId: "project-review-loop",
        traceId: "trace-review-loop",
        reviewType: "code",
        subjectId: "task-review-loop",
        status: "approved",
        revision: 2,
        summary: { openFeedback: 0 },
      });
      await dataSource.getRepository(FulcrumReviewAnnotationEntity).save({
        id: "annotation-fixed",
        reviewSessionId: "review-session-code",
        filePath: "src/app.ts",
        lineStart: 12,
        lineEnd: 14,
        severity: "medium",
        body: "Confirm dependency disclosure before execution.",
        status: "resolved",
      });
      await dataSource.getRepository(FulcrumUatSessionEntity).save({
        id: "uat-review-loop",
        projectId: "project-review-loop",
        traceId: "trace-review-loop",
        status: "approved",
        finalQaEventId: "event-final-qa",
        approvedAt: new Date("2026-05-13T12:00:00.000Z"),
      });
      await dataSource.getRepository(FulcrumGeneratedE2ETestEntity).save({
        id: "generated-e2e-review-loop",
        projectId: "project-review-loop",
        traceId: "trace-review-loop",
        sourceUatSessionId: "uat-review-loop",
        runner: "playwright",
        filePath: "tests/e2e/generated/review-loop.spec.ts",
        status: "materialized",
        bodyMd: "Covers UAT approval with real data.",
      });

      const reviewRows = await dataSource
        .getRepository(FulcrumReviewSessionEntity)
        .find({ where: { projectId: "project-review-loop" } });
      expect(reviewRows).toMatchObject([
        {
          id: "review-session-code",
          reviewType: "code",
          summary: { openFeedback: 0 },
        },
      ]);

      const generatedRows = await dataSource
        .getRepository(FulcrumGeneratedE2ETestEntity)
        .find({ where: { sourceUatSessionId: "uat-review-loop" } });
      expect(generatedRows).toMatchObject([
        {
          id: "generated-e2e-review-loop",
          runner: "playwright",
          status: "materialized",
        },
      ]);

      const artifactRows = await dataSource
        .getRepository(FulcrumArtifactEntity)
        .find({ where: { id: "artifact-prototype" } });
      expect(artifactRows).toMatchObject([
        {
          filename: "prototype.md",
          mime: "text/markdown",
          sizeBytes: "42",
          lifecycleState: "pending_review",
          archived: false,
          metadataJson: {
            sourceKind: "prototype",
            sourceId: "plan-review-loop",
          },
        },
      ]);
    } finally {
      await dataSource.destroy();
    }
  });
});
