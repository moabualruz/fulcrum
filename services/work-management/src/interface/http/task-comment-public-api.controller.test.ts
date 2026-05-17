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
import {
  WORK_MANAGEMENT_ENTITIES,
} from "@work-management/infrastructure/database/work-structure.entities.ts";
import {
  WorkManagement1778623200003,
} from "@work-management/infrastructure/database/work-structure.migration.ts";
import { TaskCommentStore } from "@work-management/infrastructure/database/task-comment-store.ts";
import type { TaskCommentPublicRow } from "@work-management/infrastructure/database/task-comment-store.ts";
import {
  TaskCommentPublicApiController,
  TaskCommentPublicApiModule,
  TaskCommentPublicApiService,
} from "@work-management/interface/http/task-comment-public-api.controller.ts";

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

async function assertTaskCommentRoundTrip(source: FulcrumTypeOrmConnectionSource, url: string): Promise<void> {
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
    await dataSource.runMigrations();
    await seedTask(dataSource, source);

    const controller = new TaskCommentPublicApiController(
      new TaskCommentPublicApiService(
        { featuresEnv: "public-api" },
        new TaskCommentStore(dataSource),
      ),
    );
    const taskId = `task-comments-${source}`;
    const root = await controller.createComment({
      orgId: `workspace-comments-${source}`,
      userId: `author-${source}`,
      taskId,
      body: mentionBody(`mentioned-${source}`),
    }) as TaskCommentPublicRow;
    const reply = await controller.createComment({
      orgId: `workspace-comments-${source}`,
      userId: `reply-author-${source}`,
      taskId,
      parentCommentId: root.id,
      body: { bodyMd: "Reply" },
    }) as TaskCommentPublicRow;

    await expect(controller.listComments({
      orgId: `workspace-comments-${source}`,
      userId: `author-${source}`,
      taskId,
    })).resolves.toEqual([
      expect.objectContaining({ id: root.id, taskId, authorId: `author-${source}`, parentCommentId: null }),
      expect.objectContaining({ id: reply.id, taskId, authorId: `reply-author-${source}`, parentCommentId: root.id }),
    ]);
    await expect(controller.threadedComments({
      orgId: `workspace-comments-${source}`,
      userId: `author-${source}`,
      taskId,
    })).resolves.toEqual([
      expect.objectContaining({
        id: root.id,
        replies: [expect.objectContaining({ id: reply.id })],
      }),
    ]);
    await expect(controller.addReaction({
      orgId: `workspace-comments-${source}`,
      userId: `mentioned-${source}`,
      commentId: root.id,
      emoji: "+1",
    })).resolves.toEqual(expect.objectContaining({
      commentId: root.id,
      userId: `mentioned-${source}`,
      emoji: "+1",
    }));
    await expect(controller.resolveComment({
      orgId: `workspace-comments-${source}`,
      userId: `mentioned-${source}`,
      commentId: root.id,
    })).resolves.toEqual(expect.objectContaining({
      id: root.id,
      resolved: true,
      resolvedBy: `mentioned-${source}`,
    }));
    await expect(controller.unresolveComment({
      orgId: `workspace-comments-${source}`,
      userId: `mentioned-${source}`,
      commentId: root.id,
    })).resolves.toEqual(expect.objectContaining({
      id: root.id,
      resolved: false,
      resolvedBy: null,
    }));
    await expect(controller.listWatchers({
      orgId: `workspace-comments-${source}`,
      userId: `author-${source}`,
      taskId,
    })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId, userId: `author-${source}`, source: "create" }),
      expect.objectContaining({ taskId, userId: `mentioned-${source}`, source: "mention" }),
    ]));
    await expect(controller.unsubscribe({
      orgId: `workspace-comments-${source}`,
      userId: `mentioned-${source}`,
      taskId,
    })).resolves.toEqual({ ok: true });
    await expect(controller.listWatchers({
      orgId: `workspace-comments-${source}`,
      userId: `author-${source}`,
      taskId,
    })).resolves.toEqual([
      expect.objectContaining({ taskId, userId: `author-${source}` }),
      expect.objectContaining({ taskId, userId: `reply-author-${source}` }),
    ]);
    await expect(controller.deleteComment({
      orgId: `workspace-comments-${source}`,
      userId: `author-${source}`,
      commentId: root.id,
    })).resolves.toEqual({ ok: true, commentId: root.id });
    await expect(controller.listComments({
      orgId: `workspace-comments-${source}`,
      userId: `author-${source}`,
      taskId,
    })).resolves.toEqual([]);
  } finally {
    await dataSource.destroy();
  }
}

describe("task comment public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, TaskCommentPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(TaskCommentPublicApiController);
    expect(appImports).toContain(TaskCommentPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, TaskCommentPublicApiController)).toBe("api/v1/comments");

    for (const method of [
      "createComment",
      "deleteComment",
      "listComments",
      "threadedComments",
      "resolveComment",
      "unresolveComment",
      "addReaction",
      "removeReaction",
      "listWatchers",
      "subscribe",
      "unsubscribe",
    ] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(TaskCommentPublicApiController.prototype, method);
      expect(descriptor).toBeDefined();
      expect(Reflect.getMetadata(METHOD_METADATA, TaskCommentPublicApiController.prototype[method])).toBe(RequestMethod.POST);
    }
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const controller = new TaskCommentPublicApiController(new TaskCommentPublicApiService());

    await expect(controller.listComments({
      orgId: "workspace-1",
      userId: "user-1",
      taskId: "task-1",
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  test("persists task comments through PGlite socket", async () => {
    await assertTaskCommentRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("persists task comments through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertTaskCommentRoundTrip("postgres", postgres.url);
  });
});

async function seedTask(
  dataSource: ReturnType<typeof createFulcrumTypeOrmDataSource>,
  source: FulcrumTypeOrmConnectionSource,
): Promise<void> {
  await dataSource.getRepository(FulcrumWorkspaceEntity).save({
    id: `workspace-comments-${source}`,
    slug: `comments-${source}`,
    name: "Comments",
  });
  await dataSource.getRepository(FulcrumProjectEntity).save({
    id: `project-comments-${source}`,
    workspaceId: `workspace-comments-${source}`,
    slug: `comments-${source}`,
    name: "Comments",
    traceId: `trace-comments-${source}`,
  });
  await dataSource.getRepository(FulcrumTaskEntity).save({
    id: `task-comments-${source}`,
    projectId: `project-comments-${source}`,
    externalId: null,
    title: "Commented task",
    description: null,
    descriptionText: null,
    tiptapContent: {},
    status: "todo",
    priority: null,
    points: null,
    assigneeId: null,
    parentTaskId: null,
    successCriteria: [],
    traceId: `trace-task-comments-${source}`,
    deletedAt: null,
  });
}

function mentionBody(userId: string): Record<string, unknown> {
  return {
    bodyMd: "Please check",
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Please check " },
          { type: "mention", attrs: { id: userId, type: "user" } },
        ],
      },
    ],
  };
}
