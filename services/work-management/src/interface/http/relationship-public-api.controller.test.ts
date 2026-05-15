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
  FulcrumTaskEntity,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";
import { RelationshipStore } from "@work-management/infrastructure/database/relationship-store.ts";
import {
  RelationshipPublicApiController,
  RelationshipPublicApiModule,
  RelationshipPublicApiService,
} from "@work-management/interface/http/relationship-public-api.controller.ts";

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

async function seedRelationshipProject(dataSource: ReturnType<typeof createFulcrumTypeOrmDataSource>, suffix: string) {
  await dataSource.getRepository(FulcrumWorkspaceEntity).save({
    id: `workspace-relationships-${suffix}`,
    slug: `relationships-${suffix}`,
    name: "Relationships",
  });
  await dataSource.getRepository(FulcrumProjectEntity).save({
    id: `project-relationships-${suffix}`,
    workspaceId: `workspace-relationships-${suffix}`,
    slug: `relationships-${suffix}`,
    name: "Relationships",
    traceId: `trace-relationships-${suffix}`,
  });
  await dataSource.getRepository(FulcrumTaskEntity).save([
    taskSeed(`project-relationships-${suffix}`, `task-a-${suffix}`, "A"),
    taskSeed(`project-relationships-${suffix}`, `task-b-${suffix}`, "B"),
    taskSeed(`project-relationships-${suffix}`, `task-c-${suffix}`, "C"),
  ]);
}

async function assertRelationshipRoundTrip(source: FulcrumTypeOrmConnectionSource, url: string): Promise<void> {
  const dataSource = await createTypeOrmStore(source, url);
  try {
    await seedRelationshipProject(dataSource, source);
    const controller = new RelationshipPublicApiController(
      new RelationshipPublicApiService(
        { featuresEnv: "public-api" },
        new RelationshipStore(dataSource),
      ),
    );

    const created = await controller.createRelationship({
      orgId: `workspace-relationships-${source}`,
      sourceTaskId: `task-a-${source}`,
      targetTaskId: `task-b-${source}`,
      type: "blocks",
    });
    expect(created).toMatchObject({
      sourceTaskId: `task-a-${source}`,
      targetTaskId: `task-b-${source}`,
      type: "blocks",
    });
    await expect(controller.listTaskBlockers({
      orgId: `workspace-relationships-${source}`,
      taskId: `task-b-${source}`,
    })).resolves.toEqual([expect.objectContaining({ id: created.id })]);
    await expect(controller.listTasksBlockedBy({
      orgId: `workspace-relationships-${source}`,
      taskId: `task-a-${source}`,
    })).resolves.toEqual([expect.objectContaining({ id: created.id })]);
    await expect(controller.listBlockedItems({
      orgId: `workspace-relationships-${source}`,
      projectId: `project-relationships-${source}`,
    })).resolves.toEqual([expect.objectContaining({ id: created.id })]);
    await expect(controller.listRelationshipsForTask({
      orgId: `workspace-relationships-${source}`,
      taskId: `task-a-${source}`,
    })).resolves.toEqual([expect.objectContaining({ id: created.id })]);
    const duplicate = await controller.markTaskAsDuplicate({
      orgId: `workspace-relationships-${source}`,
      sourceTaskId: `task-c-${source}`,
      targetTaskId: `task-b-${source}`,
      autoClose: true,
      transferWatchers: true,
    });
    expect(duplicate).toMatchObject({
      sourceTaskId: `task-c-${source}`,
      targetTaskId: `task-b-${source}`,
      type: "duplicate_of",
    });
    await expect(controller.summarizeEntityRelationships({
      orgId: `workspace-relationships-${source}`,
      projectId: `project-relationships-${source}`,
      entity: { kind: "work_item", id: `task-a-${source}`, label: "Task A" },
    })).resolves.toMatchObject({
      entity: { kind: "work_item", id: `task-a-${source}`, label: "Task A" },
      counts: { workItems: 1 },
      ids: { workItems: [`task-b-${source}`] },
    });
    await expect(controller.deleteRelationship({
      orgId: `workspace-relationships-${source}`,
      relationshipId: created.id,
    })).resolves.toEqual({ ok: true, relationshipId: created.id });
    await expect(controller.listTaskBlockers({
      orgId: `workspace-relationships-${source}`,
      taskId: `task-b-${source}`,
    })).resolves.toEqual([]);
  } finally {
    await dataSource.destroy();
  }
}

describe("relationship public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, RelationshipPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(RelationshipPublicApiController);
    expect(appImports).toContain(RelationshipPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, RelationshipPublicApiController)).toBe("api/v1/relationships");

    for (const method of [
      "createRelationship",
      "deleteRelationship",
      "listRelationshipsForTask",
      "listTaskBlockers",
      "listBlockedItems",
      "listTasksBlockedBy",
      "markTaskAsDuplicate",
      "summarizeEntityRelationships",
    ] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(RelationshipPublicApiController.prototype, method);
      expect(descriptor).toBeDefined();
      expect(Reflect.getMetadata(METHOD_METADATA, RelationshipPublicApiController.prototype[method])).toBe(RequestMethod.POST);
    }
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const controller = new RelationshipPublicApiController(new RelationshipPublicApiService());

    await expect(controller.listTaskBlockers({ orgId: "workspace-1", taskId: "task-1" })).rejects.toBeInstanceOf(NotFoundException);
  });

  test("persists task relationships through PGlite socket", async () => {
    await assertRelationshipRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("persists task relationships through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertRelationshipRoundTrip("postgres", postgres.url);
  });
});

function taskSeed(projectId: string, id: string, title: string) {
  return {
    id,
    projectId,
    externalId: null,
    title,
    description: null,
    descriptionText: null,
    tiptapContent: {},
    status: "todo",
    priority: null,
    points: null,
    assigneeId: null,
    parentTaskId: null,
    successCriteria: [],
    traceId: `trace-${id}`,
    deletedAt: null,
  };
}
