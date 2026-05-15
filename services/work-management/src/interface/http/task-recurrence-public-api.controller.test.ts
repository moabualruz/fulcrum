import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { BadRequestException, NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  type FulcrumTypeOrmConnectionSource,
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";
import {
  TaskRecurrence1778760600000,
} from "@work-management/infrastructure/database/task-recurrence.migration.ts";
import {
  FULCRUM_TASK_RECURRENCE_ENTITIES,
} from "@work-management/infrastructure/database/task-recurrence.entities.ts";
import { TaskRecurrenceStore } from "@work-management/infrastructure/database/task-recurrence-store.ts";
import {
  TaskRecurrenceCreateDto,
  TaskRecurrencePublicApiController,
  TaskRecurrencePublicApiModule,
  TaskRecurrencePublicApiService,
} from "@work-management/interface/http/task-recurrence-public-api.controller.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
  FulcrumProjectEntity,
  FulcrumTaskEntity,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";

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

describe("task recurrence public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, TaskRecurrencePublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(TaskRecurrencePublicApiController);
    expect(appImports).toContain(TaskRecurrencePublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, TaskRecurrencePublicApiController)).toBe("api/v1/recurrence");
    expect(Reflect.getMetadata(METHOD_METADATA, TaskRecurrencePublicApiController.prototype.list)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(METHOD_METADATA, TaskRecurrencePublicApiController.prototype.create)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(METHOD_METADATA, TaskRecurrencePublicApiController.prototype.delete)).toBe(RequestMethod.DELETE);
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const controller = new TaskRecurrencePublicApiController(new TaskRecurrencePublicApiService());

    await expect(controller.list({ orgId: "workspace-1", taskId: "task-1" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test("keeps request validation at the Nest boundary", () => {
    const invalid = Object.assign(new TaskRecurrenceCreateDto(), {
      orgId: "",
      taskId: "",
      triggerType: "bogus",
      intervalDays: 0,
    });

    expect(validateSync(invalid).map((error) => error.property).sort()).toEqual([
      "intervalDays",
      "orgId",
      "taskId",
      "triggerType",
    ]);
  });

  test("persists recurrence controls through PGlite socket", async () => {
    await assertRecurrenceRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("persists recurrence controls through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertRecurrenceRoundTrip("postgres", postgres.url);
  });
});

async function assertRecurrenceRoundTrip(source: FulcrumTypeOrmConnectionSource, url: string): Promise<void> {
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: [...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...FULCRUM_TASK_RECURRENCE_ENTITIES],
      migrations: [WorkflowSpine1778623200001, TaskRecurrence1778760600000],
    }),
  );

  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
    await seedRecurrenceTask(dataSource, source);
    const controller = new TaskRecurrencePublicApiController(
      new TaskRecurrencePublicApiService({ featuresEnv: "public-api" }, new TaskRecurrenceStore(dataSource)),
    );
    const orgId = `workspace-recurrence-${source}`;
    const taskId = `task-recurrence-${source}`;

    await expect(controller.list({ orgId, taskId })).resolves.toEqual([]);
    await expect(controller.create({ orgId, taskId, triggerType: "schedule" }))
      .rejects.toBeInstanceOf(BadRequestException);
    const scheduled = await controller.create({
      orgId,
      taskId,
      triggerType: "schedule",
      intervalDays: 3,
      includeSubtasks: true,
      maxOccurrences: 4,
      timezone: "UTC",
    });
    expect(scheduled).toMatchObject({
      orgId,
      sourceTaskId: taskId,
      triggerType: "schedule",
      intervalDays: 3,
      includeSubtasks: true,
      maxOccurrences: 4,
      enabled: true,
    });
    expect(scheduled.nextRunAt).toEqual(expect.any(String));
    const onComplete = await controller.create({
      orgId,
      taskId,
      triggerType: "on_complete",
      timezone: "UTC",
    });
    await expect(controller.list({ orgId, taskId })).resolves.toEqual([
      expect.objectContaining({ id: onComplete.id, triggerType: "on_complete" }),
      expect.objectContaining({ id: scheduled.id, triggerType: "schedule" }),
    ]);
    await expect(controller.delete({ ruleId: onComplete.id }, { orgId })).resolves.toEqual({ ok: true });
    await expect(controller.list({ orgId, taskId })).resolves.toEqual([
      expect.objectContaining({ id: scheduled.id }),
    ]);
    await expect(controller.delete({ ruleId: onComplete.id }, { orgId })).rejects.toBeInstanceOf(NotFoundException);
  } finally {
    await dataSource.destroy();
  }
}

async function seedRecurrenceTask(
  dataSource: ReturnType<typeof createFulcrumTypeOrmDataSource>,
  source: FulcrumTypeOrmConnectionSource,
): Promise<void> {
  await dataSource.getRepository(FulcrumWorkspaceEntity).save({
    id: `workspace-recurrence-${source}`,
    slug: `recurrence-${source}`,
    name: "Recurrence",
  });
  await dataSource.getRepository(FulcrumProjectEntity).save({
    id: `project-recurrence-${source}`,
    workspaceId: `workspace-recurrence-${source}`,
    slug: "recurrence",
    name: "Recurrence",
    traceId: `trace-recurrence-${source}`,
    methodology: "kanban",
    workflowConfig: null,
    enabledTaskTypes: null,
  });
  await dataSource.getRepository(FulcrumTaskEntity).save({
    id: `task-recurrence-${source}`,
    projectId: `project-recurrence-${source}`,
    externalId: null,
    title: "Recurring task",
    description: "Repeat this task",
    descriptionText: "Repeat this task",
    tiptapContent: {},
    status: "todo",
    priority: 2,
    points: 3,
    assigneeId: null,
    parentTaskId: null,
    successCriteria: ["done"],
    customFields: {},
    traceId: `trace-task-recurrence-${source}`,
    deletedAt: null,
  });
}
