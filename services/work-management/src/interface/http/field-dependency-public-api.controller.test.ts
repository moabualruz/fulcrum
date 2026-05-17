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
import { FieldDependencyStore } from "@work-management/infrastructure/database/field-dependency-store.ts";
import { WORK_MANAGEMENT_ENTITIES } from "@work-management/infrastructure/database/work-structure.entities.ts";
import { WorkManagement1778623200003 } from "@work-management/infrastructure/database/work-structure.migration.ts";
import {
  FieldDependencyPublicApiController,
  FieldDependencyPublicApiModule,
  FieldDependencyPublicApiService,
} from "@work-management/interface/http/field-dependency-public-api.controller.ts";
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

async function assertFieldDependencyRoundTrip(source: FulcrumTypeOrmConnectionSource, url: string): Promise<void> {
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
    await seedFieldDependencyProject(dataSource, source);

    const dependencyStore = new FieldDependencyStore(dataSource);
    const controller = new FieldDependencyPublicApiController(
      new FieldDependencyPublicApiService({ featuresEnv: "public-api" }, dependencyStore),
    );
    const customFields = new CustomFieldStore(dataSource);

    const typeField = await customFields.create({
      orgId: `workspace-field-dependency-${source}`,
      projectId: `project-field-dependency-${source}`,
      name: "Type",
      type: "select",
      configJson: { options: ["bug", "feature"] },
    });
    const severityField = await customFields.create({
      orgId: `workspace-field-dependency-${source}`,
      projectId: `project-field-dependency-${source}`,
      name: "Severity",
      type: "select",
      configJson: { options: ["minor", "critical"] },
    });

    const created = await controller.createRule({
      orgId: `workspace-field-dependency-${source}`,
      userId: `user-field-dependency-${source}`,
      projectId: `project-field-dependency-${source}`,
      sourceFieldId: "type",
      sourceValue: "bug",
      targetFieldId: "severity",
      action: "require",
    });
    expect(created).toMatchObject({
      orgId: `workspace-field-dependency-${source}`,
      projectId: `project-field-dependency-${source}`,
      sourceFieldId: "type",
      sourceValue: "bug",
      targetFieldId: "severity",
      action: "require",
    });
    await expect(controller.listRules({
      orgId: `workspace-field-dependency-${source}`,
      userId: `user-field-dependency-${source}`,
      projectId: `project-field-dependency-${source}`,
    })).resolves.toEqual([expect.objectContaining({ id: created.id })]);

    await expect(customFields.setTaskField({
      orgId: `workspace-field-dependency-${source}`,
      taskId: `task-field-dependency-${source}`,
      fieldDefId: typeField!.id,
      value: "bug",
    })).rejects.toThrow("Required fields missing due to dependency rules: severity");
    await expect(customFields.setTaskField({
      orgId: `workspace-field-dependency-${source}`,
      taskId: `task-field-dependency-${source}`,
      fieldDefId: severityField!.id,
      value: "critical",
    })).resolves.toEqual({
      taskId: `task-field-dependency-${source}`,
      customFields: { severity: "critical" },
    });
    await expect(customFields.setTaskField({
      orgId: `workspace-field-dependency-${source}`,
      taskId: `task-field-dependency-${source}`,
      fieldDefId: typeField!.id,
      value: "bug",
    })).resolves.toEqual({
      taskId: `task-field-dependency-${source}`,
      customFields: { severity: "critical", type: "bug" },
    });
    await expect(customFields.clearTaskField({
      orgId: `workspace-field-dependency-${source}`,
      taskId: `task-field-dependency-${source}`,
      fieldDefId: severityField!.id,
    })).rejects.toThrow("Required fields missing due to dependency rules: severity");

    await expect(controller.deleteRule(
      { id: created.id },
      { orgId: `workspace-field-dependency-${source}`, userId: `user-field-dependency-${source}` },
    )).resolves.toEqual({ ok: true });
  } finally {
    await dataSource.destroy();
  }
}

describe("field dependency public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, FieldDependencyPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(FieldDependencyPublicApiController);
    expect(appImports).toContain(FieldDependencyPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, FieldDependencyPublicApiController)).toBe("api/v1");
    expect(Reflect.getMetadata(METHOD_METADATA, FieldDependencyPublicApiController.prototype.listRules))
      .toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(METHOD_METADATA, FieldDependencyPublicApiController.prototype.createRule))
      .toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(METHOD_METADATA, FieldDependencyPublicApiController.prototype.deleteRule))
      .toBe(RequestMethod.DELETE);
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const controller = new FieldDependencyPublicApiController(new FieldDependencyPublicApiService());

    await expect(controller.listRules({
      orgId: "workspace-1",
      userId: "user-1",
      projectId: "project-1",
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  test.skip("persists field dependency rules and validation through PGlite socket", async () => {
    await assertFieldDependencyRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("persists field dependency rules and validation through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertFieldDependencyRoundTrip("postgres", postgres.url);
  });
});

async function seedFieldDependencyProject(
  dataSource: ReturnType<typeof createFulcrumTypeOrmDataSource>,
  source: FulcrumTypeOrmConnectionSource,
): Promise<void> {
  await dataSource.getRepository(FulcrumWorkspaceEntity).save({
    id: `workspace-field-dependency-${source}`,
    slug: `field-dependency-${source}`,
    name: "Field Dependencies",
  });
  await dataSource.getRepository(FulcrumProjectEntity).save({
    id: `project-field-dependency-${source}`,
    workspaceId: `workspace-field-dependency-${source}`,
    slug: `field-dependency-${source}`,
    name: "Field Dependencies",
    traceId: `trace-field-dependency-${source}`,
  });
  await dataSource.getRepository(FulcrumTaskEntity).save({
    id: `task-field-dependency-${source}`,
    projectId: `project-field-dependency-${source}`,
    externalId: null,
    title: "Field dependency task",
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
    traceId: `trace-task-field-dependency-${source}`,
    deletedAt: null,
  });
}
