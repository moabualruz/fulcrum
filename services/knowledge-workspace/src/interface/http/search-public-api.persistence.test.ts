import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import {
  KNOWLEDGE_WORKSPACE_ENTITIES,
  KnowledgeWorkspacePageEntity,
  KnowledgeWorkspaceSearchEntryEntity,
} from "@knowledge-workspace/infrastructure/database/document.entities.ts";
import { KnowledgeDocuments1778623200004 } from "@knowledge-workspace/infrastructure/database/document.migration.ts";
import { SearchPublicStore } from "@knowledge-workspace/infrastructure/database/search-public-store.ts";
import {
  SearchPublicApiController,
  SearchPublicApiService,
} from "@knowledge-workspace/interface/http/search-public-api.controller.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
  FulcrumDocumentEntity,
  FulcrumProjectEntity,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";
import {
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
  type FulcrumTypeOrmConnectionSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const DOC_ID = "55555555-5555-4555-8555-555555555555";
const PAGE_ID = "66666666-6666-4666-8666-666666666666";

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

async function authenticate(header: string | undefined): Promise<string | null> {
  return header === "Bearer valid-token" ? USER_ID : null;
}

async function assertSearchPublicApiRoundTrip(
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
      ],
      migrations: [
        WorkflowSpine1778623200001,
        KnowledgeDocuments1778623200004,
      ],
    }),
  );

  await dataSource.initialize();
  try {
    const migrations = await dataSource.runMigrations();
    expect(migrations.map((migration) => migration.name)).toEqual([
      "WorkflowSpine1778623200001",
      "KnowledgeDocuments1778623200004",
    ]);

    await dataSource.getRepository(FulcrumWorkspaceEntity).save({
      id: ORG_ID,
      slug: `search-${source}`,
      name: "Search",
    });
    await dataSource.getRepository(FulcrumProjectEntity).save([
      {
        id: PROJECT_ID,
        workspaceId: ORG_ID,
        slug: `search-project-${source}`,
        name: "Search Project",
        traceId: `trace-search-project-${source}`,
      },
      {
        id: OTHER_PROJECT_ID,
        workspaceId: ORG_ID,
        slug: `other-search-project-${source}`,
        name: "Other Search Project",
        traceId: `trace-other-search-project-${source}`,
      },
    ]);
    await dataSource.getRepository(FulcrumDocumentEntity).save({
      id: DOC_ID,
      projectId: PROJECT_ID,
      title: "Planning context",
      bodyMd: "Kernel planning context",
      sourceType: "freeform",
      traceId: `trace-search-doc-${source}`,
    });
    await dataSource.getRepository(KnowledgeWorkspacePageEntity).save({
      id: PAGE_ID,
      projectId: PROJECT_ID,
      documentId: DOC_ID,
      parentPageId: null,
      title: "Kernel planning context",
      slug: `kernel-planning-${source}`,
      icon: null,
      position: "0001",
      bodyMd: "Kernel planning context body",
      editorJson: { type: "doc" },
      yjsState: null,
      traceId: `trace-search-page-${source}`,
    });
    await dataSource.getRepository(KnowledgeWorkspaceSearchEntryEntity).save({
      id: `search-entry-${source}`,
      pageId: PAGE_ID,
      projectId: PROJECT_ID,
      sourceKind: "page",
      title: "Kernel planning context",
      searchText: "Kernel planning context body",
      excerpt: "Kernel planning context body",
      traceId: `trace-search-entry-${source}`,
    });

    const controller = new SearchPublicApiController(
      new SearchPublicApiService(
        { featuresEnv: "public-api", authenticate },
        new SearchPublicStore(dataSource),
      ),
    );

    const hits = await controller.search({
      q: "kernel",
      org_id: ORG_ID,
      project_id: PROJECT_ID,
      kind: "page",
    }, "Bearer valid-token");
    expect(hits).toEqual([
      expect.objectContaining({
        source_kind: "page",
        source_id: PAGE_ID,
        title: "Kernel planning context",
        body: "Kernel planning context body",
      }),
    ]);
    await expect(controller.search({
      q: "kernel",
      org_id: ORG_ID,
      project_id: OTHER_PROJECT_ID,
    }, "Bearer valid-token")).resolves.toEqual([]);
    await expect(controller.suggest({
      prefix: "Ker",
      org_id: ORG_ID,
      kind: "page",
      limit: 1,
    }, "Bearer valid-token")).resolves.toEqual({ suggestions: ["Kernel planning context"] });

    const created = await controller.createSavedSearch({
      org_id: ORG_ID,
      user_id: USER_ID,
      name: "Kernel saved search",
      query_json: { q: "kernel", kind: "page" },
      scope: "private",
      project_id: PROJECT_ID,
    }, "Bearer valid-token");
    expect(created).toEqual(expect.objectContaining({
      id: expect.any(String),
      org_id: ORG_ID,
      user_id: USER_ID,
      name: "Kernel saved search",
      query_json: JSON.stringify({ q: "kernel", kind: "page" }),
      project_id: PROJECT_ID,
    }));

    await expect(controller.listSavedSearches({
      org_id: ORG_ID,
      user_id: USER_ID,
    }, "Bearer valid-token")).resolves.toEqual([
      expect.objectContaining({ name: "Kernel saved search" }),
    ]);

    const updated = await controller.updateSavedSearch({
      id: created.id,
    }, {
      org_id: ORG_ID,
      user_id: USER_ID,
      name: "Kernel saved search revised",
      query_json: { q: "kernel revised", kind: "page" },
      scope: "project",
      project_id: PROJECT_ID,
    }, "Bearer valid-token");
    expect(updated).toEqual(expect.objectContaining({
      id: created.id,
      name: "Kernel saved search revised",
      query_json: JSON.stringify({ q: "kernel revised", kind: "page" }),
      scope: "project",
      project_id: PROJECT_ID,
    }));

    await expect(controller.recordClick({
      org_id: ORG_ID,
      user_id: USER_ID,
      query: "kernel",
      result_id: PAGE_ID,
      result_kind: "page",
      position: 1,
      project_id: PROJECT_ID,
    }, "Bearer valid-token")).resolves.toEqual({ recorded: true });

    const snapshot = await controller.snapshot({
      org_id: ORG_ID,
      project_id: PROJECT_ID,
    }, "Bearer valid-token");
    expect(JSON.parse(snapshot.snapshot)).toEqual({
      entries: [
        expect.objectContaining({
          id: `search-entry-${source}`,
          source_kind: "page",
          source_id: PAGE_ID,
          title: "Kernel planning context",
          body: "Kernel planning context body",
        }),
      ],
    });

    await expect(controller.deleteSavedSearch({
      id: created.id,
    }, {
      org_id: ORG_ID,
      user_id: USER_ID,
    }, "Bearer valid-token")).resolves.toBeUndefined();

    await expect(controller.listSavedSearches({
      org_id: ORG_ID,
      user_id: USER_ID,
    }, "Bearer valid-token")).resolves.toEqual([]);
  } finally {
    await dataSource.destroy();
  }
}

describe("search public API TypeORM persistence", () => {
  test("serves search, suggestions, and saved searches through PGlite socket", async () => {
    await assertSearchPublicApiRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("serves search, suggestions, and saved searches through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertSearchPublicApiRoundTrip("postgres", postgres.url);
  });
});
