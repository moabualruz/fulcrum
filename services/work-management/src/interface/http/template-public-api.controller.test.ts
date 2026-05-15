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
import { WORK_MANAGEMENT_ENTITIES } from "@work-management/infrastructure/database/work-structure.entities.ts";
import { WorkManagement1778623200003 } from "@work-management/infrastructure/database/work-structure.migration.ts";
import { TaskTemplateStore } from "@work-management/infrastructure/database/task-template-store.ts";
import {
  TemplatePublicApiController,
  TemplatePublicApiModule,
  TemplatePublicApiService,
} from "@work-management/interface/http/template-public-api.controller.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
  FulcrumProjectEntity,
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

async function assertTemplateRoundTrip(source: FulcrumTypeOrmConnectionSource, url: string): Promise<void> {
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
    await seedTemplateProject(dataSource, source);
    const controller = new TemplatePublicApiController(
      new TemplatePublicApiService(
        { featuresEnv: "public-api" },
        new TaskTemplateStore(dataSource),
      ),
    );

    const workspaceTemplate = await controller.createTemplate({
      orgId: `workspace-template-${source}`,
      userId: `user-template-${source}`,
      name: "Workspace default",
      templateData: { title: "Workspace task", priority: "normal" },
      description: "Shared template",
    });
    const projectTemplate = await controller.createTemplate({
      orgId: `workspace-template-${source}`,
      userId: `user-template-${source}`,
      projectId: `project-template-${source}`,
      name: "Bug template",
      templateData: { title: "Bug", priority: "high", labels: ["bug"] },
      description: "Project bug template",
    });

    await expect(controller.listTemplates({
      orgId: `workspace-template-${source}`,
      userId: `user-template-${source}`,
      projectId: `project-template-${source}`,
    })).resolves.toEqual([
      expect.objectContaining({ id: workspaceTemplate.id, projectId: null }),
      expect.objectContaining({ id: projectTemplate.id, projectId: `project-template-${source}` }),
    ]);
    await expect(controller.applyTemplate(
      { id: projectTemplate.id },
      {
        orgId: `workspace-template-${source}`,
        userId: `user-template-${source}`,
        overrides: { priority: "urgent" },
      },
    )).resolves.toEqual({ title: "Bug", priority: "urgent", labels: ["bug"] });
    await expect(controller.setDefaultTemplate(
      { id: projectTemplate.id },
      {
        orgId: `workspace-template-${source}`,
        userId: `user-template-${source}`,
        projectId: `project-template-${source}`,
      },
    )).resolves.toEqual({ ok: true });
    await expect(controller.deleteTemplate(
      { id: projectTemplate.id },
      {
        orgId: `workspace-template-${source}`,
        userId: `user-template-${source}`,
      },
    )).resolves.toEqual({ ok: true });
  } finally {
    await dataSource.destroy();
  }
}

describe("template public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, TemplatePublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(TemplatePublicApiController);
    expect(appImports).toContain(TemplatePublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, TemplatePublicApiController)).toBe("api/v1/templates");
    expect(Reflect.getMetadata(METHOD_METADATA, TemplatePublicApiController.prototype.createTemplate))
      .toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(METHOD_METADATA, TemplatePublicApiController.prototype.deleteTemplate))
      .toBe(RequestMethod.DELETE);
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const controller = new TemplatePublicApiController(new TemplatePublicApiService());

    await expect(controller.listTemplates({ orgId: "workspace-1", userId: "user-1" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test("persists templates through PGlite socket", async () => {
    await assertTemplateRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("persists templates through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertTemplateRoundTrip("postgres", postgres.url);
  });
});

async function seedTemplateProject(
  dataSource: ReturnType<typeof createFulcrumTypeOrmDataSource>,
  source: FulcrumTypeOrmConnectionSource,
): Promise<void> {
  await dataSource.getRepository(FulcrumWorkspaceEntity).save({
    id: `workspace-template-${source}`,
    slug: `template-${source}`,
    name: "Templates",
  });
  await dataSource.getRepository(FulcrumProjectEntity).save({
    id: `project-template-${source}`,
    workspaceId: `workspace-template-${source}`,
    slug: `template-${source}`,
    name: "Templates",
    traceId: `trace-template-${source}`,
  });
}
