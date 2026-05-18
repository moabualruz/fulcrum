import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  type FulcrumTypeOrmConnectionSource,
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";
import { PlanningStructurePublicStore } from "@work-management/infrastructure/database/planning-structure-public-store.ts";
import { TaskPublicStore } from "@work-management/infrastructure/database/task-public-store.ts";
import { WORK_MANAGEMENT_ENTITIES } from "@work-management/infrastructure/database/work-structure.entities.ts";
import { WorkManagement1778623200003 } from "@work-management/infrastructure/database/work-structure.migration.ts";
import {
  PlanningStructurePublicApiController,
  PlanningStructurePublicApiModule,
  PlanningStructurePublicApiService,
} from "@work-management/interface/http/planning-structure-public-api.controller.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
  FulcrumProjectEntity,
  FulcrumTaskEntity,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const TASK_ID = "33333333-3333-4333-8333-333333333333";

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

async function assertPlanningStructureRoundTrip(
  source: FulcrumTypeOrmConnectionSource,
  url: string,
): Promise<void> {
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: [...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...WORK_MANAGEMENT_ENTITIES],
      migrations: [WorkflowSpine1778623200001, WorkManagement1778623200003],
    }),
  );

  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
    await dataSource.getRepository(FulcrumWorkspaceEntity).save({
      id: ORG_ID,
      slug: `planning-structures-${source}`,
      name: "Planning Structures",
    });
    await dataSource.getRepository(FulcrumProjectEntity).save({
      id: PROJECT_ID,
      workspaceId: ORG_ID,
      slug: `planning-project-${source}`,
      name: "Planning Project",
      traceId: `trace-planning-project-${source}`,
    });
    await dataSource.getRepository(FulcrumTaskEntity).save({
      id: TASK_ID,
      projectId: PROJECT_ID,
      externalId: null,
      title: "Manual work item",
      description: null,
      descriptionText: null,
      tiptapContent: { type: "doc", content: [] },
      status: "todo",
      priority: 1,
      points: null,
      assigneeId: null,
      parentTaskId: null,
      successCriteria: [],
      traceId: `trace-task-${source}`,
      deletedAt: null,
    });

    const controller = new PlanningStructurePublicApiController(
      new PlanningStructurePublicApiService(
        { featuresEnv: "public-api" },
        new PlanningStructurePublicStore(dataSource),
      ),
    );

    const module = await controller.createModule({
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      name: "Manual PM",
      status: "active",
    });
    const label = await controller.createLabel({
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      name: "frontend",
      color: "#22c55e",
    });
    const intake = await controller.createIntake({
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      title: "Inbox request",
      description: "Captured manually",
      source: "manual",
    });

    await expect(controller.addModuleTask(
      { id: module.id },
      { orgId: ORG_ID, projectId: PROJECT_ID, taskId: TASK_ID },
    )).resolves.toEqual(expect.objectContaining({
      projectId: PROJECT_ID,
      taskId: TASK_ID,
      targetId: module.id,
      targetType: "module",
    }));
    await expect(controller.addLabelTask(
      { id: label.id },
      { orgId: ORG_ID, projectId: PROJECT_ID, taskId: TASK_ID },
    )).resolves.toEqual(expect.objectContaining({
      projectId: PROJECT_ID,
      taskId: TASK_ID,
      targetId: label.id,
      targetType: "label",
    }));

    await expect(controller.list({ orgId: ORG_ID, projectId: PROJECT_ID })).resolves.toEqual({
      modules: [expect.objectContaining({ id: module.id, name: "Manual PM", status: "active", taskCount: 1 })],
      labels: [expect.objectContaining({ id: label.id, name: "frontend", color: "#22c55e", taskCount: 1 })],
      intakeRequests: [expect.objectContaining({ id: intake.id, title: "Inbox request", status: "open", source: "manual" })],
    });

    const workbench = await new TaskPublicStore(dataSource).buildManualWorkbench({
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      traceId: `trace-workbench-${source}`,
      viewMode: "board",
      filters: { moduleIds: [module.id], labels: ["frontend"] },
    });
    expect(workbench).toEqual(expect.objectContaining({
      projectId: PROJECT_ID,
      filtersApplied: 2,
      listRows: [expect.objectContaining({ id: TASK_ID, moduleId: module.id, labels: ["frontend"] })],
    }));

    await expect(controller.updateIntake(
      { id: intake.id },
      { orgId: ORG_ID, projectId: PROJECT_ID, status: "accepted", taskId: TASK_ID },
    )).resolves.toEqual(expect.objectContaining({ id: intake.id, status: "accepted", taskId: TASK_ID }));
    await expect(controller.removeModuleTask(
      { id: module.id, taskId: TASK_ID },
      { orgId: ORG_ID, projectId: PROJECT_ID },
    )).resolves.toEqual(expect.objectContaining({ targetId: module.id, taskId: TASK_ID }));
    await expect(controller.removeLabelTask(
      { id: label.id, taskId: TASK_ID },
      { orgId: ORG_ID, projectId: PROJECT_ID },
    )).resolves.toEqual(expect.objectContaining({ targetId: label.id, taskId: TASK_ID }));
    await expect(controller.deleteIntake({ id: intake.id }, { orgId: ORG_ID, projectId: PROJECT_ID })).resolves.toBeUndefined();
    await expect(controller.deleteLabel({ id: label.id }, { orgId: ORG_ID, projectId: PROJECT_ID })).resolves.toBeUndefined();
    await expect(controller.deleteModule({ id: module.id }, { orgId: ORG_ID, projectId: PROJECT_ID })).resolves.toBeUndefined();
  } finally {
    await dataSource.destroy();
  }
}

describe("planning structure public API", () => {
  test("is mounted in the server app", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, PlanningStructurePublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(PlanningStructurePublicApiController);
    expect(appImports).toContain(PlanningStructurePublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, PlanningStructurePublicApiController)).toBe("api/v1/planning-structures");
    expect(Reflect.getMetadata(METHOD_METADATA, PlanningStructurePublicApiController.prototype.createModule)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(PATH_METADATA, PlanningStructurePublicApiController.prototype.createModule)).toBe("modules");
  });

  test("serves planning structure CRUD through PGlite socket", async () => {
    await assertPlanningStructureRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("serves planning structure CRUD through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertPlanningStructureRoundTrip("postgres", postgres.url);
  });
});
