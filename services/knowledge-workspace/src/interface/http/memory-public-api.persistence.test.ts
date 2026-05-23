import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { NotFoundException } from "@nestjs/common";

import {
  FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
  FulcrumMemoryEntity,
} from "@execution-orchestration/infrastructure/database/run-context.entities.ts";
import { RunContext1778623200005 } from "@execution-orchestration/infrastructure/database/run-context.migration.ts";
import { DocumentPublicStore } from "@knowledge-workspace/infrastructure/database/document-public-store.ts";
import { KNOWLEDGE_WORKSPACE_ENTITIES } from "@knowledge-workspace/infrastructure/database/document.entities.ts";
import { KnowledgeDocuments1778623200004 } from "@knowledge-workspace/infrastructure/database/document.migration.ts";
import { MemoryPublicStore } from "@knowledge-workspace/infrastructure/database/memory-public-store.ts";
import {
  MemoryPublicApiController,
  MemoryPublicApiService,
} from "@knowledge-workspace/interface/http/memory-public-api.controller.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
  FulcrumDocumentEntity,
  FulcrumProjectEntity,
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
const MEMORY_ID = "33333333-3333-4333-8333-333333333333";
const AUTHORIZATION = `Bearer test-jwt:${ORG_ID}`;

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

async function assertMemoryPublicApiRoundTrip(
  source: FulcrumTypeOrmConnectionSource,
  url: string,
): Promise<void> {
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: [
        ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
        ...KNOWLEDGE_WORKSPACE_ENTITIES,
        ...FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
      ],
      migrations: [
        WorkflowSpine1778623200001,
        KnowledgeDocuments1778623200004,
        RunContext1778623200005,
      ],
    }),
  );

  await dataSource.initialize();
  try {
    const migrations = await dataSource.runMigrations();
    expect(migrations.map((migration) => migration.name)).toEqual([
      "WorkflowSpine1778623200001",
      "KnowledgeDocuments1778623200004",
      "RunContext1778623200005",
    ]);

    await dataSource.getRepository(FulcrumWorkspaceEntity).save({
      id: ORG_ID,
      slug: `workspace-${source}`,
      name: "Workspace",
    });
    await dataSource.getRepository(FulcrumProjectEntity).save({
      id: PROJECT_ID,
      workspaceId: ORG_ID,
      slug: `project-${source}`,
      name: "Project",
      traceId: `trace-project-${source}`,
    });
    await dataSource.getRepository(FulcrumMemoryEntity).save({
      id: MEMORY_ID,
      projectId: PROJECT_ID,
      traceId: `trace-memory-${source}`,
      scope: "project",
      kind: "note",
      body: "Remember this context.",
      tags: ["planning"],
      importance: "medium",
      source: "manual",
      sourceRef: { projectId: PROJECT_ID },
      archived: false,
    });

    const controller = new MemoryPublicApiController(
      new MemoryPublicApiService(
        {
          featuresEnv: "public-api,report-llm-narration",
          digestClient: {
            summarize: async () => "Digest summary from persisted memories.",
          },
        },
        new MemoryPublicStore(dataSource),
        new DocumentPublicStore(dataSource),
      ),
    );

    await expect(controller.listMemories({ projectId: PROJECT_ID, tags: "planning" }, AUTHORIZATION)).resolves.toEqual([
      expect.objectContaining({
        id: MEMORY_ID,
        projectId: PROJECT_ID,
        global: false,
        traceId: `trace-memory-${source}`,
      }),
    ]);
    await expect(controller.searchMemories({ query: "context", projectId: PROJECT_ID }, AUTHORIZATION)).resolves
      .toEqual([expect.objectContaining({ id: MEMORY_ID, body: "Remember this context." })]);

    const created = await controller.createMemory({
      projectId: PROJECT_ID,
      body: "Created memory",
      tags: ["api"],
      importance: "high",
      source: "manual",
      sourceRef: { route: "public-api" },
    }, AUTHORIZATION);
    expect(created).toEqual(expect.objectContaining({
      id: expect.any(String),
      projectId: PROJECT_ID,
      body: "Created memory",
      importance: "high",
    }));

    await expect(controller.getMemory({ id: MEMORY_ID }, AUTHORIZATION)).resolves.toEqual(
      expect.objectContaining({ id: MEMORY_ID, body: "Remember this context." }),
    );
    await expect(controller.patchMemory({ id: MEMORY_ID }, { body: "Updated context", tags: ["updated"] }, AUTHORIZATION)).resolves.toEqual(
      expect.objectContaining({ id: MEMORY_ID, body: "Updated context", tags: ["updated"] }),
    );
    await expect(controller.promoteMemory({ id: MEMORY_ID }, AUTHORIZATION)).resolves.toEqual(
      expect.objectContaining({ id: MEMORY_ID, global: true }),
    );
    await expect(controller.archiveMemory({ id: MEMORY_ID }, AUTHORIZATION)).resolves.toEqual(
      expect.objectContaining({ id: MEMORY_ID, archived: true }),
    );
    await expect(controller.restoreMemory({ id: MEMORY_ID }, AUTHORIZATION)).resolves.toEqual(
      expect.objectContaining({ id: MEMORY_ID, archived: false }),
    );
    await expect(
      controller.digestMemories({
        projectId: PROJECT_ID,
        since: "2026-05-01T00:00:00.000Z",
      }, AUTHORIZATION),
    ).resolves.toEqual({
      docId: expect.any(String),
      body: "Digest summary from persisted memories.",
      projectId: PROJECT_ID,
      since: "2026-05-01T00:00:00.000Z",
      inputs: {
        projectId: PROJECT_ID,
        since: "2026-05-01T00:00:00.000Z",
        memoryIds: expect.arrayContaining([expect.any(String)]),
      },
      outputs: { docId: expect.any(String) },
    });
    await expect(
      dataSource.getRepository(FulcrumDocumentEntity).findOneBy({ sourceType: "memory_digest" }),
    ).resolves.toEqual(expect.objectContaining({
      projectId: PROJECT_ID,
      bodyMd: "Digest summary from persisted memories.",
    }));
    await expect(controller.deleteMemory({ id: MEMORY_ID }, { confirm: "true" }, AUTHORIZATION)).resolves.toEqual({
      deleted: true,
      id: MEMORY_ID,
    });
    await expect(controller.getMemory({ id: MEMORY_ID }, AUTHORIZATION)).rejects.toBeInstanceOf(NotFoundException);
  } finally {
    await dataSource.destroy();
  }
}

describe("memory public API TypeORM persistence", () => {
  test("serves memory lifecycle through PGlite socket", async () => {
    await assertMemoryPublicApiRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("serves memory lifecycle through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertMemoryPublicApiRoundTrip("postgres", postgres.url);
  });
});
