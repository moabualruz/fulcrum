import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { NotFoundException } from "@nestjs/common";

import {
  WorkManagementCycleEntity,
  WorkManagementCycleTaskEntity,
  WORK_MANAGEMENT_ENTITIES,
} from "@work-management/infrastructure/database/work-structure.entities.ts";
import { WorkManagement1778623200003 } from "@work-management/infrastructure/database/work-structure.migration.ts";
import { SprintPublicStore } from "@work-management/infrastructure/database/sprint-public-store.ts";
import {
  SprintPublicApiController,
  SprintPublicApiService,
} from "@work-management/interface/http/sprint-public-api.controller.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
  FulcrumProjectEntity,
  FulcrumTaskEntity,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";
import {
  type FulcrumTypeOrmConnectionSource,
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const CYCLE_ID = "44444444-4444-4444-8444-444444444444";
const TASK_ID = "55555555-5555-4555-8555-555555555555";

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

async function assertSprintPublicApiRoundTrip(
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
      slug: `workspace-${source}`,
      name: "Workspace",
    });
    await dataSource.getRepository(FulcrumProjectEntity).save([
      {
        id: PROJECT_ID,
        workspaceId: ORG_ID,
        slug: `project-${source}`,
        name: "Project",
        traceId: `trace-project-${source}`,
      },
      {
        id: OTHER_PROJECT_ID,
        workspaceId: ORG_ID,
        slug: `other-${source}`,
        name: "Other Project",
        traceId: `trace-other-project-${source}`,
      },
    ]);
    await dataSource.getRepository(WorkManagementCycleEntity).save({
      id: CYCLE_ID,
      projectId: PROJECT_ID,
      name: "Cycle 1",
      status: "planning",
      startsAt: new Date("2026-05-14T00:00:00.000Z"),
      endsAt: new Date("2026-05-21T00:00:00.000Z"),
      traceId: `trace-cycle-${source}`,
    });
    await dataSource.getRepository(FulcrumTaskEntity).save({
      id: TASK_ID,
      projectId: PROJECT_ID,
      externalId: null,
      title: "Task for sprint",
      description: null,
      descriptionText: null,
      tiptapContent: { type: "doc", content: [] },
      status: "todo",
      priority: null,
      points: null,
      assigneeId: null,
      parentTaskId: null,
      successCriteria: [],
      traceId: `trace-task-${source}`,
      deletedAt: null,
    });

    const controller = new SprintPublicApiController(
      new SprintPublicApiService(
        { featuresEnv: "public-api" },
        new SprintPublicStore(dataSource),
      ),
    );

    await expect(controller.listSprints({ orgId: ORG_ID, project_id: PROJECT_ID })).resolves.toEqual({
      data: [
        expect.objectContaining({
          id: CYCLE_ID,
          orgId: ORG_ID,
          projectId: PROJECT_ID,
          name: "Cycle 1",
          status: "planning",
          traceId: `trace-cycle-${source}`,
        }),
      ],
    });
    await expect(controller.listSprints({ orgId: ORG_ID, project_id: OTHER_PROJECT_ID })).resolves.toEqual({
      data: [],
    });

    const created = await controller.createSprint({
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      name: `Cycle 2 ${source}`,
      status: "active",
    });
    expect(created).toEqual(expect.objectContaining({
      id: expect.any(String),
      projectId: PROJECT_ID,
      name: `Cycle 2 ${source}`,
      status: "active",
    }));

    await expect(controller.getSprint({ id: CYCLE_ID }, { orgId: ORG_ID })).resolves.toEqual(
      expect.objectContaining({ id: CYCLE_ID, name: "Cycle 1" }),
    );
    await expect(controller.patchSprint(
      { id: CYCLE_ID },
      { orgId: ORG_ID, name: "Cycle 1 revised", status: "completed" },
    )).resolves.toEqual(expect.objectContaining({ id: CYCLE_ID, name: "Cycle 1 revised", status: "completed" }));
    await expect(controller.addTask(
      { id: CYCLE_ID },
      { orgId: ORG_ID, taskId: TASK_ID },
    )).resolves.toEqual(expect.objectContaining({
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      sprintId: CYCLE_ID,
      taskId: TASK_ID,
      traceId: `trace-sprint-task-${CYCLE_ID}-${TASK_ID}`,
    }));
    await expect(dataSource.getRepository(WorkManagementCycleTaskEntity).findBy({
      cycleId: CYCLE_ID,
      taskId: TASK_ID,
    })).resolves.toHaveLength(1);
    await expect(controller.removeTask(
      { id: CYCLE_ID, taskId: TASK_ID },
      { orgId: ORG_ID },
    )).resolves.toEqual(expect.objectContaining({
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      sprintId: CYCLE_ID,
      taskId: TASK_ID,
    }));
    await expect(dataSource.getRepository(WorkManagementCycleTaskEntity).findBy({
      cycleId: CYCLE_ID,
      taskId: TASK_ID,
    })).resolves.toHaveLength(0);
    await expect(controller.deleteSprint({ id: CYCLE_ID }, { orgId: ORG_ID })).resolves.toBeUndefined();
    await expect(controller.getSprint({ id: CYCLE_ID }, { orgId: ORG_ID })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  } finally {
    await dataSource.destroy();
  }
}

describe("sprint public API TypeORM persistence", () => {
  test("serves sprint CRUD through PGlite socket", async () => {
    await assertSprintPublicApiRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("serves sprint CRUD through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertSprintPublicApiRoundTrip("postgres", postgres.url);
  });
});
