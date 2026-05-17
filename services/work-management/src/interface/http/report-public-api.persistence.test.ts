import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import { ReportPublicStore } from "@work-management/infrastructure/database/report-public-store.ts";
import {
  WorkManagement1778623200003,
} from "@work-management/infrastructure/database/work-structure.migration.ts";
import {
  WORK_MANAGEMENT_ENTITIES,
  WorkManagementCycleEntity,
  WorkManagementCycleTaskEntity,
} from "@work-management/infrastructure/database/work-structure.entities.ts";
import {
  ReportPublicApiController,
  ReportPublicApiService,
} from "@work-management/interface/http/report-public-api.controller.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
  FulcrumProjectEntity,
  FulcrumTaskEntity,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";
import {
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
  type FulcrumTypeOrmConnectionSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const SPRINT_ID = "44444444-4444-4444-8444-444444444444";
const COMPLETED_TASK_ID = "55555555-5555-4555-8555-555555555555";
const OPEN_TASK_ID = "66666666-6666-4666-8666-666666666666";

let pglite: PGlite | undefined;
let socketServer: PGLiteSocketServer | undefined;
let postgres: TemporaryPostgres | undefined;

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
  if (postgres) {
    await postgres.stop();
    postgres = undefined;
  }
});

async function assertReportPublicApiRoundTrip(
  source: FulcrumTypeOrmConnectionSource,
  url: string,
): Promise<void> {
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: [
        ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
        ...WORK_MANAGEMENT_ENTITIES,
      ],
      migrations: [
        WorkflowSpine1778623200001,
        WorkManagement1778623200003,
      ],
    }),
  );

  await dataSource.initialize();
  try {
    const migrations = await dataSource.runMigrations();
    expect(migrations.map((migration) => migration.name)).toEqual([
      "WorkflowSpine1778623200001",
      "WorkManagement1778623200003",
    ]);

    await dataSource.getRepository(FulcrumWorkspaceEntity).save({
      id: ORG_ID,
      slug: `workspace-reports-${source}`,
      name: "Workspace",
    });
    await dataSource.getRepository(FulcrumProjectEntity).save([
      {
        id: PROJECT_ID,
        workspaceId: ORG_ID,
        slug: `reports-${source}`,
        name: "Reports",
        traceId: `trace-report-project-${source}`,
      },
      {
        id: OTHER_PROJECT_ID,
        workspaceId: ORG_ID,
        slug: `empty-reports-${source}`,
        name: "Empty Reports",
        traceId: `trace-empty-report-project-${source}`,
      },
    ]);
    await dataSource.getRepository(WorkManagementCycleEntity).save({
      id: SPRINT_ID,
      projectId: PROJECT_ID,
      name: "Sprint 1",
      status: "active",
      startsAt: new Date("2026-05-14T00:00:00.000Z"),
      endsAt: new Date("2026-05-16T00:00:00.000Z"),
      traceId: `trace-report-cycle-${source}`,
    });
    await dataSource.getRepository(FulcrumTaskEntity).save([
      {
        id: COMPLETED_TASK_ID,
        projectId: PROJECT_ID,
        title: "Done task",
        status: "done",
        successCriteria: ["passes"],
        traceId: `trace-done-task-${source}`,
      },
      {
        id: OPEN_TASK_ID,
        projectId: PROJECT_ID,
        title: "Open task",
        status: "todo",
        successCriteria: ["ships"],
        traceId: `trace-open-task-${source}`,
      },
    ]);
    await dataSource.getRepository(WorkManagementCycleTaskEntity).save([
      {
        id: `cycle-task-done-${source}`,
        projectId: PROJECT_ID,
        cycleId: SPRINT_ID,
        taskId: COMPLETED_TASK_ID,
        traceId: `trace-cycle-task-done-${source}`,
      },
      {
        id: `cycle-task-open-${source}`,
        projectId: PROJECT_ID,
        cycleId: SPRINT_ID,
        taskId: OPEN_TASK_ID,
        traceId: `trace-cycle-task-open-${source}`,
      },
    ]);

    const controller = new ReportPublicApiController(
      new ReportPublicApiService(
        { featuresEnv: "public-api" },
        new ReportPublicStore(dataSource),
      ),
    );

    await expect(controller.burndown({
      orgId: ORG_ID,
      project_id: PROJECT_ID,
      sprint_id: SPRINT_ID,
    })).resolves.toEqual({
      data: [
        expect.objectContaining({ date: "2026-05-14", remaining: 2, ideal: 2 }),
        expect.objectContaining({ date: "2026-05-15", remaining: 1, ideal: 1 }),
        expect.objectContaining({ date: "2026-05-16", remaining: 1, ideal: 0 }),
      ],
    });
    await expect(controller.velocity({ orgId: ORG_ID, project_id: PROJECT_ID })).resolves.toEqual({
      data: [
        expect.objectContaining({
          sprintId: SPRINT_ID,
          sprintName: "Sprint 1",
          points: 1,
          completedTasks: 1,
          totalTasks: 2,
        }),
      ],
    });
    await expect(controller.velocity({ orgId: ORG_ID, project_id: OTHER_PROJECT_ID })).resolves.toEqual({
      data: [],
    });
  } finally {
    await dataSource.destroy();
  }
}

describe("report public API TypeORM persistence", () => {
  test("serves report queries through PGlite socket", async () => {
    await assertReportPublicApiRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("serves report queries through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertReportPublicApiRoundTrip("postgres", postgres.url);
  });
});
