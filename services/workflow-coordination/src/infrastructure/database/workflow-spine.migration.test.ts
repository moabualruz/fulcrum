import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
  FulcrumAcpSessionEntity,
  FulcrumAgentRunEntity,
  FulcrumDocumentEntity,
  FulcrumProjectEntity,
  FulcrumTaskDependencyEntity,
  FulcrumTaskEntity,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";
import {
  FULCRUM_TYPEORM_MIGRATIONS_TABLE,
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

  const connection = socketServer.getServerConn();
  const [host, port] = connection.split(":");
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

describe("TypeORM workflow-spine migration", () => {
  test("applies through PGlite socket and persists the copied workflow trace spine", async () => {
    const url = await startPgliteSocket();
    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "pglite-socket",
        url,
        entities: FULCRUM_WORKFLOW_SPINE_ENTITIES,
        migrations: [WorkflowSpine1778623200001],
      }),
    );

    await dataSource.initialize();
    try {
      const migrations = await dataSource.runMigrations();
      expect(migrations.map((migration) => migration.name)).toEqual([
        "WorkflowSpine1778623200001",
      ]);

      const tables = await dataSource.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
      ) as Array<{ table_name: string }>;
      expect(tables.map((row) => row.table_name)).toEqual(
        expect.arrayContaining([
          FULCRUM_TYPEORM_MIGRATIONS_TABLE,
          "fulcrum_acp_sessions",
          "fulcrum_agent_runs",
          "fulcrum_documents",
          "fulcrum_projects",
          "fulcrum_task_dependencies",
          "fulcrum_tasks",
          "fulcrum_workspaces",
        ]),
      );

      await dataSource.getRepository(FulcrumWorkspaceEntity).save({
        id: "workspace-cycle",
        slug: "cycle",
        name: "Workflow workspace",
      });
      await dataSource.getRepository(FulcrumProjectEntity).save({
        id: "project-workflow",
        workspaceId: "workspace-cycle",
        slug: "workflow",
        name: "Workflow",
        traceId: "trace-workflow",
      });
      await dataSource.getRepository(FulcrumTaskEntity).save({
        id: "task-docs",
        projectId: "project-workflow",
        externalId: "EXT-DOCS",
        title: "Collect freeform docs",
        status: "done",
        successCriteria: ["source context captured"],
        traceId: "trace-workflow",
      });
      await dataSource.getRepository(FulcrumTaskEntity).save({
        id: "task-plan",
        projectId: "project-workflow",
        externalId: "EXT-PLAN",
        title: "Plan with prototype review",
        status: "ready",
        successCriteria: ["prototype reviewed", "trace preserved"],
        traceId: "trace-workflow",
      });
      await dataSource.getRepository(FulcrumTaskDependencyEntity).save({
        id: "dep-task-plan-docs",
        projectId: "project-workflow",
        taskId: "task-plan",
        dependsOnTaskId: "task-docs",
        dependencyKind: "blocks_execution",
        traceId: "trace-workflow",
      });
      await dataSource.getRepository(FulcrumDocumentEntity).save({
        id: "doc-freeform",
        projectId: "project-workflow",
        title: "Freeform start",
        bodyMd: "User starts from freeform docs.",
        sourceType: "freeform",
        traceId: "trace-workflow",
      });
      await dataSource.getRepository(FulcrumAcpSessionEntity).save({
        id: "acp-session-plan",
        projectId: "project-workflow",
        traceId: "trace-workflow",
        agentName: "planner",
        mode: "plan",
        model: "gpt-5",
        status: "active",
        trafficLog: [{ direction: "outbound", method: "session/new" }],
      });
      await dataSource.getRepository(FulcrumAgentRunEntity).save({
        id: "run-dependency-tree",
        projectId: "project-workflow",
        taskId: "task-plan",
        traceId: "trace-workflow",
        status: "queued",
        dependencyTree: ["task-docs", "task-plan"],
      });

      const taskRows = await dataSource.getRepository(FulcrumTaskEntity).find({
        where: { id: "task-plan" },
      });
      expect(taskRows).toMatchObject([
        {
          id: "task-plan",
          externalId: "EXT-PLAN",
          successCriteria: ["prototype reviewed", "trace preserved"],
          traceId: "trace-workflow",
        },
      ]);

      const runRows = await dataSource.getRepository(FulcrumAgentRunEntity).find();
      expect(runRows).toMatchObject([
        {
          id: "run-dependency-tree",
          taskId: "task-plan",
          dependencyTree: ["task-docs", "task-plan"],
        },
      ]);
    } finally {
      await dataSource.destroy();
    }
  });
});
