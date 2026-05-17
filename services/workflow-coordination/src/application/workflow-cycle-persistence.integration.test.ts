import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { MODULE_METADATA } from "@nestjs/common/constants";

import {
  FULCRUM_REVIEW_WORKFLOW_ENTITIES,
} from "@planning-review/infrastructure/database/review-workflow.entities.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { ReviewWorkflow1778623200002 } from "@planning-review/infrastructure/database/review-workflow.migration.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";
import {
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { AppModule } from "@fulcrum/server/app.module.ts";
import { WorkflowCycleModule } from "@workflow-coordination/interface/http/workflow-cycle.module.ts";
import { WorkflowCyclePersistenceService } from "@workflow-coordination/application/workflow-cycle-persistence.service.ts";

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

describe("Workflow cycle TypeORM persistence service", () => {
  test("module exposes the server-owned workflow persistence service", () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, WorkflowCycleModule) as unknown[];
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, WorkflowCycleModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(providers).toContain(WorkflowCyclePersistenceService);
    expect(exports).toContain(WorkflowCyclePersistenceService);
    expect(appImports).toContain(WorkflowCycleModule);
  });

  test("persists and reloads a freeform -> plan -> review -> UAT -> generated-E2E cycle", async () => {
    const url = await startPgliteSocket();
    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "pglite-socket",
        url,
        entities: [...FULCRUM_WORKFLOW_SPINE_ENTITIES,...FULCRUM_REVIEW_WORKFLOW_ENTITIES,
        ],
        migrations: [WorkflowSpine1778623200001, ReviewWorkflow1778623200002],
      }),);

    await dataSource.initialize();
    try {
      await dataSource.runMigrations();

      const service = new WorkflowCyclePersistenceService(dataSource);
      await service.persistCycle({
        workspace: {
          id: "workspace-cycle",
          slug: "cycle",
          name: "Cycle workspace",
        },
        project: {
          id: "project-cycle",
          slug: "cycle",
          name: "Workflow cycle",
          traceId: "trace-cycle",
        },
        freeformDoc: {
          id: "doc-cycle",
          title: "Freeform request",
          bodyMd: "Start with docs, plan with ACP, review, then generate real E2E.",
        },
        planningTask: {
          id: "task-cycle-plan",
          title: "Plan and prototype",
          status: "done",
          successCriteria: ["prototype accepted", "tasks decomposed"],
        },
        executionTask: {
          id: "task-cycle-execute",
          title: "Execute dependency tree",
          status: "in_review",
          successCriteria: ["dependencies executed", "QA feedback closed"],
          dependsOnTaskId: "task-cycle-plan",
        },
        plan: {
          id: "plan-cycle",
          title: "Technical implementation plan",
          planMd: "# Plan\nPrototype first, then dependency-aware execution.",
          status: "approved",
        },
        prototype: {
          id: "prototype-cycle",
          artifactId: "artifact-cycle-prototype",
          title: "Prototype shell",
          outputRef: "artifacts/prototype.md",
        },
        review: {
          id: "review-cycle",
          type: "code",
          status: "approved",
          annotationId: "annotation-cycle",
        },
        uat: {
          id: "uat-cycle",
          status: "approved",
          finalQaEventId: "event-final-qa-cycle",
        },
        generatedE2E: {
          id: "e2e-cycle",
          runner: "playwright",
          filePath: "tests/e2e/generated/cycle.spec.ts",
          bodyMd: "Uses real workflow data for regression coverage.",
        },
      });

      const summary = await service.loadTraceSummary("trace-cycle");

      expect(summary).toEqual({
        traceId: "trace-cycle",
        workspaceId: "workspace-cycle",
        projectId: "project-cycle",
        documentIds: ["doc-cycle"],
        taskIds: ["task-cycle-execute", "task-cycle-plan"],
        dependencyEdges: [{ taskId: "task-cycle-execute", dependsOnTaskId: "task-cycle-plan" }],
        planIds: ["plan-cycle"],
        prototypeIds: ["prototype-cycle"],
        reviewSessionIds: ["review-cycle"],
        uatSessionIds: ["uat-cycle"],
        generatedE2ETestIds: ["e2e-cycle"],
        artifactIds: ["artifact-cycle-prototype"],
        agentRunIds: ["run-cycle-execute"],
      });
    } finally {
      await dataSource.destroy();
    }
  });
});
