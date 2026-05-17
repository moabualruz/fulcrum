import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { NotFoundException } from "@nestjs/common";

import { ProjectPublicStore } from "@work-management/infrastructure/database/project-public-store.ts";
import {
  ProjectPublicApiController,
  ProjectPublicApiService,
} from "@work-management/interface/http/project-public-api.controller.ts";
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
const OTHER_ORG_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_PROJECT_ID = "44444444-4444-4444-8444-444444444444";

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

async function assertProjectPublicApiRoundTrip(
  source: FulcrumTypeOrmConnectionSource,
  url: string,
): Promise<void> {
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: FULCRUM_WORKFLOW_SPINE_ENTITIES,
      migrations: [WorkflowSpine1778623200001],
    }),
  );

  await dataSource.initialize();
  try {
    const migrations = await dataSource.runMigrations();
    expect(migrations.map((migration) => migration.name)).toEqual(["WorkflowSpine1778623200001"]);

    await dataSource.getRepository(FulcrumWorkspaceEntity).save([
      { id: ORG_ID, slug: `workspace-${source}`, name: "Workspace" },
      { id: OTHER_ORG_ID, slug: `other-workspace-${source}`, name: "Other Workspace" },
    ]);
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
        workspaceId: OTHER_ORG_ID,
        slug: `other-project-${source}`,
        name: "Other Project",
        traceId: `trace-other-project-${source}`,
      },
    ]);
    await dataSource.getRepository(FulcrumTaskEntity).save([
      taskRow("task-1", PROJECT_ID, "todo", source),
      taskRow("task-2", PROJECT_ID, "done", source),
      taskRow("task-3", PROJECT_ID, "done", source),
      taskRow("task-4", OTHER_PROJECT_ID, "done", source),
    ]);

    const controller = new ProjectPublicApiController(
      new ProjectPublicApiService(
        { featuresEnv: "public-api" },
        new ProjectPublicStore(dataSource),
      ),
    );

    await expect(controller.listProjects({ orgId: ORG_ID })).resolves.toEqual({
      data: [
        expect.objectContaining({
          id: PROJECT_ID,
          orgId: ORG_ID,
          slug: `project-${source}`,
          name: "Project",
          traceId: `trace-project-${source}`,
        }),
      ],
    });
    await expect(controller.listProjects({ orgId: OTHER_ORG_ID })).resolves.toEqual({
      data: [expect.objectContaining({ id: OTHER_PROJECT_ID, orgId: OTHER_ORG_ID })],
    });

    const created = await controller.createProject({
      orgId: ORG_ID,
      kind: "project",
      name: `New Project ${source}`,
      slug: `new-project-${source}`,
      repoPath: `/tmp/new-project-${source}`,
      template: "default",
    });
    expect(created).toEqual(expect.objectContaining({
      id: expect.any(String),
      orgId: ORG_ID,
      name: `New Project ${source}`,
      slug: `new-project-${source}`,
      kind: "project",
      repoPath: `/tmp/new-project-${source}`,
      template: "default",
    }));

    await expect(controller.getProject({ id: PROJECT_ID }, { orgId: ORG_ID })).resolves.toEqual(
      expect.objectContaining({ id: PROJECT_ID, name: "Project" }),
    );
    await expect(controller.getProject({ id: OTHER_PROJECT_ID }, { orgId: ORG_ID })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(controller.patchProject(
      { id: PROJECT_ID },
      {
        orgId: ORG_ID,
        name: "Project revised",
        memory_config: {
          bm25_weight: 1.7,
          recency_weight: 1.2,
          importance_boost: 2,
          token_budget: 8192,
        },
      },
    )).resolves.toEqual(expect.objectContaining({
      id: PROJECT_ID,
      name: "Project revised",
      memory_config: {
        bm25_weight: 1.7,
        recency_weight: 1.2,
        importance_boost: 2,
        token_budget: 8192,
      },
    }));
    await expect(dataSource.getRepository(FulcrumProjectEntity).findOneByOrFail({
      id: PROJECT_ID,
      workspaceId: ORG_ID,
    })).resolves.toEqual(expect.objectContaining({
      workflowConfig: expect.objectContaining({
        memory_config: {
          bm25_weight: 1.7,
          recency_weight: 1.2,
          importance_boost: 2,
          token_budget: 8192,
        },
      }),
    }));
    await expect(controller.projectStats({ id: PROJECT_ID }, { orgId: ORG_ID })).resolves.toEqual(
      expect.objectContaining({
        projectId: PROJECT_ID,
        taskCount: 3,
        doneTaskCount: 2,
        openTaskCount: 1,
      }),
    );
    await expect(controller.deleteProject({ id: PROJECT_ID }, { orgId: ORG_ID })).resolves.toBeUndefined();
    await expect(controller.getProject({ id: PROJECT_ID }, { orgId: ORG_ID })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  } finally {
    await dataSource.destroy();
  }
}

describe("project public API TypeORM persistence", () => {
  test("serves project CRUD through PGlite socket", async () => {
    await assertProjectPublicApiRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("serves project CRUD through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertProjectPublicApiRoundTrip("postgres", postgres.url);
  });
});

function taskRow(id: string, projectId: string, status: string, source: FulcrumTypeOrmConnectionSource) {
  return {
    id,
    projectId,
    externalId: null,
    title: `Task ${id}`,
    description: null,
    descriptionText: null,
    tiptapContent: { type: "doc", content: [] },
    status,
    priority: null,
    points: null,
    assigneeId: null,
    parentTaskId: null,
    successCriteria: [],
    traceId: `trace-${id}-${source}`,
    deletedAt: null,
  };
}
