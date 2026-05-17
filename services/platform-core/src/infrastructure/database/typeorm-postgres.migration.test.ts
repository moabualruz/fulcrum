import { afterEach, describe, expect, test } from "bun:test";

import {
  FULCRUM_REVIEW_WORKFLOW_ENTITIES,
} from "@planning-review/infrastructure/database/review-workflow.entities.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { ReviewWorkflow1778623200002 } from "@planning-review/infrastructure/database/review-workflow.migration.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";
import {
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { WorkflowCyclePersistenceService } from "@workflow-coordination/application/workflow-cycle-persistence.service.ts";

let postgres: TemporaryPostgres | undefined;

afterEach(async () => {
  if (postgres) {
    await postgres.stop();
    postgres = undefined;
  }
});

describe("TypeORM workflow migrations on real PostgreSQL", () => {
  test("apply and persist the cycle workflow cycle on a PostgreSQL server", async () => {
    postgres = await startTemporaryPostgres();

    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "postgres",
        url: postgres.url,
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

      const versionRows = await dataSource.query(
        "SELECT current_setting('server_version') AS server_version, current_database() AS database_name",
      ) as Array<{ database_name: string; server_version: string }>;
      expect(versionRows[0]?.database_name).toBe("postgres");
      expect(versionRows[0]?.server_version).toMatch(/^\d+/);

      const service = new WorkflowCyclePersistenceService(dataSource);
      await service.persistCycle({
        workspace: {
          id: "workspace-postgres",
          slug: "postgres",
          name: "PostgreSQL workspace",
        },
        project: {
          id: "project-postgres",
          slug: "postgres-cycle",
          name: "PostgreSQL cycle cycle",
          traceId: "trace-postgres",
        },
        freeformDoc: {
          id: "doc-postgres",
          title: "Freeform PostgreSQL start",
          bodyMd: "Freeform docs must persist on production PostgreSQL too.",
        },
        planningTask: {
          id: "task-postgres-plan",
          title: "Plan with prototype",
          status: "done",
          successCriteria: ["prototype accepted"],
        },
        executionTask: {
          id: "task-postgres-run",
          title: "Run dependency tree",
          status: "in_review",
          successCriteria: ["dependency tree disclosed", "review feedback closed"],
          dependsOnTaskId: "task-postgres-plan",
        },
        plan: {
          id: "plan-postgres",
          title: "PostgreSQL backed plan",
          planMd: "# Plan\nPersist the full cycle workflow on PostgreSQL.",
          status: "approved",
        },
        prototype: {
          id: "prototype-postgres",
          artifactId: "artifact-postgres-prototype",
          title: "PostgreSQL prototype artifact",
          outputRef: "artifacts/postgres-prototype.md",
        },
        review: {
          id: "review-postgres",
          type: "uat",
          status: "approved",
          annotationId: "annotation-postgres",
        },
        uat: {
          id: "uat-postgres",
          status: "approved",
          finalQaEventId: "event-postgres-final-qa",
        },
        generatedE2E: {
          id: "e2e-postgres",
          runner: "bun",
          filePath: "tests/e2e/generated/postgres-cycle.test.ts",
          bodyMd: "Regression test generated from approved real PostgreSQL workflow data.",
        },
      });

      await expect(service.loadTraceSummary("trace-postgres")).resolves.toMatchObject({
        traceId: "trace-postgres",
        workspaceId: "workspace-postgres",
        projectId: "project-postgres",
        documentIds: ["doc-postgres"],
        dependencyEdges: [{ taskId: "task-postgres-run", dependsOnTaskId: "task-postgres-plan" }],
        generatedE2ETestIds: ["e2e-postgres"],
      });
    } finally {
      await dataSource.destroy();
    }
  });
});
