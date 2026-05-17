import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  type FulcrumTypeOrmConnectionSource,
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";
import { CustomFieldStore } from "@work-management/infrastructure/database/custom-field-store.ts";
import { WORK_MANAGEMENT_ENTITIES } from "@work-management/infrastructure/database/work-structure.entities.ts";
import { WorkManagement1778623200003 } from "@work-management/infrastructure/database/work-structure.migration.ts";
import {
  CustomFieldPublicApiController,
  CustomFieldPublicApiModule,
  CustomFieldPublicApiService,
} from "@work-management/interface/http/custom-field-public-api.controller.ts";
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

async function assertCustomFieldRoundTrip(source: FulcrumTypeOrmConnectionSource, url: string): Promise<void> {
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
    await seedCustomFieldProject(dataSource, source);
    const controller = new CustomFieldPublicApiController(
      new CustomFieldPublicApiService(
        { featuresEnv: "public-api" },
        new CustomFieldStore(dataSource),
      ),
    );

    const created = await controller.createField({
      orgId: `workspace-custom-field-${source}`,
      userId: `user-custom-field-${source}`,
      projectId: `project-custom-field-${source}`,
      name: "Severity",
      type: "select",
      required: true,
      configJson: { options: ["minor", "critical"] },
    });
    expect(created).toMatchObject({
      orgId: `workspace-custom-field-${source}`,
      projectId: `project-custom-field-${source}`,
      slug: "severity",
      type: "select",
      required: true,
      position: 0,
    });
    await expect(controller.listFields({
      orgId: `workspace-custom-field-${source}`,
      userId: `user-custom-field-${source}`,
      projectId: `project-custom-field-${source}`,
    })).resolves.toEqual([expect.objectContaining({ id: created.id, name: "Severity" })]);
    await expect(controller.setTaskField({
      orgId: `workspace-custom-field-${source}`,
      userId: `user-custom-field-${source}`,
      taskId: `task-custom-field-${source}`,
      fieldDefId: created.id,
      value: "critical",
    })).resolves.toEqual({
      taskId: `task-custom-field-${source}`,
      customFields: { severity: "critical" },
    });
    await expect(controller.clearTaskField({
      orgId: `workspace-custom-field-${source}`,
      userId: `user-custom-field-${source}`,
      taskId: `task-custom-field-${source}`,
      fieldDefId: created.id,
    })).rejects.toThrow("required");
    await expect(controller.updateField(
      { id: created.id },
      {
        orgId: `workspace-custom-field-${source}`,
        userId: `user-custom-field-${source}`,
        required: false,
        position: 3,
      },
    )).resolves.toEqual(expect.objectContaining({ id: created.id, required: false, position: 3 }));
    await expect(controller.clearTaskField({
      orgId: `workspace-custom-field-${source}`,
      userId: `user-custom-field-${source}`,
      taskId: `task-custom-field-${source}`,
      fieldDefId: created.id,
    })).resolves.toEqual({ taskId: `task-custom-field-${source}`, customFields: {} });
    await expect(controller.reorderFields({
      orgId: `workspace-custom-field-${source}`,
      userId: `user-custom-field-${source}`,
      projectId: `project-custom-field-${source}`,
      orderedIds: [created.id],
    })).resolves.toEqual({ ok: true });
    await expect(controller.deleteField(
      { id: created.id },
      {
        orgId: `workspace-custom-field-${source}`,
        userId: `user-custom-field-${source}`,
      },
    )).resolves.toEqual({ ok: true });
  } finally {
    await dataSource.destroy();
  }
}

describe("custom field public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, CustomFieldPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(CustomFieldPublicApiController);
    expect(appImports).toContain(CustomFieldPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, CustomFieldPublicApiController)).toBe("api/v1");
    expect(Reflect.getMetadata(METHOD_METADATA, CustomFieldPublicApiController.prototype.createField))
      .toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(METHOD_METADATA, CustomFieldPublicApiController.prototype.updateField))
      .toBe(RequestMethod.PATCH);
    expect(Reflect.getMetadata(METHOD_METADATA, CustomFieldPublicApiController.prototype.deleteField))
      .toBe(RequestMethod.DELETE);
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const controller = new CustomFieldPublicApiController(new CustomFieldPublicApiService());

    await expect(controller.listFields({ orgId: "workspace-1", userId: "user-1" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test.skip("persists custom fields through PGlite socket", async () => {
    await assertCustomFieldRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("persists custom fields through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertCustomFieldRoundTrip("postgres", postgres.url);
  });
});

async function seedCustomFieldProject(
  dataSource: ReturnType<typeof createFulcrumTypeOrmDataSource>,
  source: FulcrumTypeOrmConnectionSource,
): Promise<void> {
  await dataSource.getRepository(FulcrumWorkspaceEntity).save({
    id: `workspace-custom-field-${source}`,
    slug: `custom-field-${source}`,
    name: "Custom Fields",
  });
  await dataSource.getRepository(FulcrumProjectEntity).save({
    id: `project-custom-field-${source}`,
    workspaceId: `workspace-custom-field-${source}`,
    slug: `custom-field-${source}`,
    name: "Custom Fields",
    traceId: `trace-custom-field-${source}`,
  });
  await dataSource.getRepository(FulcrumTaskEntity).save({
    id: `task-custom-field-${source}`,
    projectId: `project-custom-field-${source}`,
    externalId: null,
    title: "Custom field task",
    description: null,
    descriptionText: null,
    tiptapContent: {},
    status: "todo",
    priority: null,
    points: null,
    assigneeId: null,
    parentTaskId: null,
    successCriteria: [],
    customFields: {},
    traceId: `trace-task-custom-field-${source}`,
    deletedAt: null,
  });
}
