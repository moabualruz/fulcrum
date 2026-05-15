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
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
  FulcrumProjectEntity,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";
import { WorkflowSettingsStore } from "@work-management/infrastructure/database/workflow-settings-store.ts";
import {
  WorkflowSettingsPublicApiController,
  WorkflowSettingsPublicApiModule,
  WorkflowSettingsPublicApiService,
} from "@work-management/interface/http/workflow-settings-public-api.controller.ts";

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

async function createTypeOrmStore(source: FulcrumTypeOrmConnectionSource, url: string) {
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: FULCRUM_WORKFLOW_SPINE_ENTITIES,
      migrations: [WorkflowSpine1778623200001],
    }),
  );

  await dataSource.initialize();
  await dataSource.runMigrations();
  return dataSource;
}

async function assertWorkflowSettingsRoundTrip(source: FulcrumTypeOrmConnectionSource, url: string): Promise<void> {
  const dataSource = await createTypeOrmStore(source, url);
  try {
    await dataSource.getRepository(FulcrumWorkspaceEntity).save({
      id: `workspace-workflow-settings-${source}`,
      slug: `workflow-settings-${source}`,
      name: "Workflow Settings",
    });
    await dataSource.getRepository(FulcrumProjectEntity).save({
      id: `project-workflow-settings-${source}`,
      workspaceId: `workspace-workflow-settings-${source}`,
      slug: `workflow-settings-${source}`,
      name: "Workflow Settings",
      traceId: `trace-workflow-settings-${source}`,
    });

    const controller = new WorkflowSettingsPublicApiController(
      new WorkflowSettingsPublicApiService(
        { featuresEnv: "public-api" },
        new WorkflowSettingsStore(dataSource),
      ),
    );

    await expect(controller.getDefaultWorkflow({ methodology: "scrum" })).resolves.toMatchObject({
      methodology: "scrum",
      transitions: {
        Backlog: expect.arrayContaining(["Todo"]),
      },
    });
    await expect(controller.getMethodology({
      orgId: `workspace-workflow-settings-${source}`,
      projectId: `project-workflow-settings-${source}`,
    })).resolves.toEqual({
      projectId: `project-workflow-settings-${source}`,
      methodology: "kanban",
    });
    await expect(controller.updateMethodology({
      orgId: `workspace-workflow-settings-${source}`,
      projectId: `project-workflow-settings-${source}`,
      methodology: "scrum",
      resetWorkflow: true,
    })).resolves.toMatchObject({
      projectId: `project-workflow-settings-${source}`,
      methodology: "scrum",
      transitions: {
        Backlog: expect.arrayContaining(["Todo"]),
      },
    });
    await expect(controller.updateEnabledTaskTypes({
      orgId: `workspace-workflow-settings-${source}`,
      projectId: `project-workflow-settings-${source}`,
      types: ["task", "bug"],
    })).resolves.toEqual({
      projectId: `project-workflow-settings-${source}`,
      enabledTaskTypes: ["task", "bug"],
    });
    await expect(controller.updateTransitions({
      orgId: `workspace-workflow-settings-${source}`,
      projectId: `project-workflow-settings-${source}`,
      transitions: { Todo: ["Done"] },
    })).resolves.toEqual({
      projectId: `project-workflow-settings-${source}`,
      transitions: { Todo: ["Done"] },
    });
    await expect(controller.validateTransition({
      orgId: `workspace-workflow-settings-${source}`,
      projectId: `project-workflow-settings-${source}`,
      fromStatus: "Todo",
      toStatus: "Done",
    })).resolves.toEqual({
      projectId: `project-workflow-settings-${source}`,
      allowed: true,
    });
    await expect(controller.validateTransition({
      orgId: `workspace-workflow-settings-${source}`,
      projectId: `project-workflow-settings-${source}`,
      fromStatus: "Done",
      toStatus: "Todo",
    })).resolves.toMatchObject({
      projectId: `project-workflow-settings-${source}`,
      allowed: false,
    });
  } finally {
    await dataSource.destroy();
  }
}

describe("workflow settings public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, WorkflowSettingsPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(WorkflowSettingsPublicApiController);
    expect(appImports).toContain(WorkflowSettingsPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, WorkflowSettingsPublicApiController)).toBe("api/v1/workflows");

    const routes = [
      ["getDefaultWorkflow", "default", RequestMethod.POST],
      ["getEnabledTaskTypes", "task-types/get", RequestMethod.POST],
      ["updateEnabledTaskTypes", "task-types/update", RequestMethod.POST],
      ["getMethodology", "methodology/get", RequestMethod.POST],
      ["updateMethodology", "methodology/update", RequestMethod.POST],
      ["getTransitions", "transitions/get", RequestMethod.POST],
      ["updateTransitions", "transitions/update", RequestMethod.POST],
      ["validateTransition", "transitions/validate", RequestMethod.POST],
    ] as const;

    for (const [method, path, verb] of routes) {
      const descriptor = Object.getOwnPropertyDescriptor(
        WorkflowSettingsPublicApiController.prototype,
        method,
      );
      expect(descriptor).toBeDefined();
      expect(Reflect.getMetadata(PATH_METADATA, WorkflowSettingsPublicApiController.prototype[method])).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, WorkflowSettingsPublicApiController.prototype[method])).toBe(verb);
    }
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const controller = new WorkflowSettingsPublicApiController(new WorkflowSettingsPublicApiService());

    await expect(controller.getDefaultWorkflow({ methodology: "kanban" })).rejects.toBeInstanceOf(NotFoundException);
  });

  test("persists methodology, task types, transitions, and validation through PGlite socket", async () => {
    await assertWorkflowSettingsRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("persists methodology, task types, transitions, and validation through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertWorkflowSettingsRoundTrip("postgres", postgres.url);
  });
});
