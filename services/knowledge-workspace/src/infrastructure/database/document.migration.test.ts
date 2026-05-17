import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import {
  KNOWLEDGE_WORKSPACE_ENTITIES,
  KnowledgeWorkspaceAttachmentEntity,
  KnowledgeWorkspaceBacklinkEntity,
  KnowledgeWorkspaceCollaborationStateEntity,
  KnowledgeWorkspaceCommentEntity,
  KnowledgeWorkspacePageEntity,
  KnowledgeWorkspacePageHistoryEntity,
  KnowledgeWorkspaceSavedSearchEntity,
  KnowledgeWorkspaceSearchEntryEntity,
} from "@knowledge-workspace/infrastructure/database/document.entities.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
  FulcrumDocumentEntity,
  FulcrumProjectEntity,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { KnowledgeDocuments1778623200004 } from "@knowledge-workspace/infrastructure/database/document.migration.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";
import {
  type FulcrumTypeOrmConnectionSource,
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";

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

async function assertKnowledgeDocumentsRoundTrip(
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
      migrations: [WorkflowSpine1778623200001, KnowledgeDocuments1778623200004],
    }),
  );

  await dataSource.initialize();
  try {
    const migrations = await dataSource.runMigrations();
    expect(migrations.map((migration) => migration.name)).toEqual([
      "WorkflowSpine1778623200001",
      "KnowledgeDocuments1778623200004",
    ]);

    const tables = await dataSource.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    ) as Array<{ table_name: string }>;
    expect(tables.map((row) => row.table_name)).toEqual(
      expect.arrayContaining([
        "fulcrum_doc_attachments",
        "fulcrum_doc_backlinks",
        "fulcrum_doc_collaboration_states",
        "fulcrum_doc_comments",
        "fulcrum_doc_page_history",
        "fulcrum_doc_pages",
        "fulcrum_doc_search_entries",
        "fulcrum_saved_searches",
      ]),
    );

    await dataSource.getRepository(FulcrumWorkspaceEntity).save({
      id: `workspace-docs-${source}`,
      slug: `docs-${source}`,
      name: "knowledge documents workspace",
    });
    await dataSource.getRepository(FulcrumProjectEntity).save({
      id: `project-docs-${source}`,
      workspaceId: `workspace-docs-${source}`,
      slug: "knowledge-documents",
      name: "knowledge documents parity",
      traceId: `trace-docs-${source}`,
    });
    await dataSource.getRepository(FulcrumDocumentEntity).save([
      {
        id: `doc-root-${source}`,
        projectId: `project-docs-${source}`,
        title: "Freeform root",
        bodyMd: "# Freeform root",
        sourceType: "freeform",
        traceId: `trace-docs-${source}`,
      },
      {
        id: `doc-child-${source}`,
        projectId: `project-docs-${source}`,
        title: "Planning context",
        bodyMd: "Child page used by ACP planning.",
        sourceType: "planning_context",
        traceId: `trace-docs-${source}`,
      },
    ]);

    await dataSource.getRepository(KnowledgeWorkspacePageEntity).save([
      {
        id: `page-root-${source}`,
        projectId: `project-docs-${source}`,
        documentId: `doc-root-${source}`,
        parentPageId: null,
        title: "Freeform root",
        slug: "freeform-root",
        icon: "spark",
        position: "0001",
        bodyMd: "# Freeform root",
        editorJson: { type: "doc", content: [{ type: "paragraph" }] },
        yjsState: "root-yjs-state",
        traceId: `trace-docs-${source}`,
      },
      {
        id: `page-child-${source}`,
        projectId: `project-docs-${source}`,
        documentId: `doc-child-${source}`,
        parentPageId: `page-root-${source}`,
        title: "Planning context",
        slug: "planning-context",
        icon: "file-text",
        position: "0001.0001",
        bodyMd: "Child page used by ACP planning.",
        editorJson: { type: "doc", content: [{ type: "paragraph" }] },
        yjsState: "child-yjs-state",
        traceId: `trace-docs-${source}`,
      },
    ]);
    await dataSource.getRepository(KnowledgeWorkspacePageHistoryEntity).save({
      id: `history-child-v1-${source}`,
      pageId: `page-child-${source}`,
      version: 1,
      title: "Planning context",
      bodyMd: "Child page used by ACP planning.",
      editorJson: { type: "doc" },
      yjsState: "child-yjs-state",
      contributorIds: ["local-admin"],
      traceId: `trace-docs-${source}`,
    });
    await dataSource.getRepository(KnowledgeWorkspaceCommentEntity).save({
      id: `comment-child-${source}`,
      pageId: `page-child-${source}`,
      parentCommentId: null,
      authorId: "local-admin",
      content: { type: "doc", content: [{ type: "paragraph", text: "Review this context." }] },
      selection: { from: 1, to: 12 },
      status: "open",
      traceId: `trace-docs-${source}`,
    });
    await dataSource.getRepository(KnowledgeWorkspaceAttachmentEntity).save({
      id: `attachment-child-${source}`,
      pageId: `page-child-${source}`,
      fileName: "prototype.md",
      mimeType: "text/markdown",
      sizeBytes: 128,
      storagePath: "artifacts/prototype.md",
      checksumSha256: "sha256-knowledge-base",
      traceId: `trace-docs-${source}`,
    });
    await dataSource.getRepository(KnowledgeWorkspaceBacklinkEntity).save({
      id: `backlink-root-child-${source}`,
      sourcePageId: `page-root-${source}`,
      targetPageId: `page-child-${source}`,
      linkType: "context",
      traceId: `trace-docs-${source}`,
    });
    await dataSource.getRepository(KnowledgeWorkspaceCollaborationStateEntity).save({
      id: `collab-child-${source}`,
      pageId: `page-child-${source}`,
      provider: "yjs",
      stateVector: "state-vector",
      documentState: "encoded-yjs-doc",
      activeClientIds: ["client-a", "client-b"],
      traceId: `trace-docs-${source}`,
    });
    await dataSource.getRepository(KnowledgeWorkspaceSearchEntryEntity).save({
      id: `search-child-${source}`,
      pageId: `page-child-${source}`,
      projectId: `project-docs-${source}`,
      sourceKind: "page",
      title: "Planning context",
      searchText: "Planning context Child page used by ACP planning.",
      excerpt: "Child page used by ACP planning.",
      traceId: `trace-docs-${source}`,
    });
    await dataSource.getRepository(KnowledgeWorkspaceSavedSearchEntity).save({
      id: `saved-search-${source}`,
      workspaceId: `workspace-docs-${source}`,
      userId: "local-admin",
      name: "Planning context search",
      queryJson: { q: "planning", kind: "page" },
      scope: "private",
      projectId: `project-docs-${source}`,
    });

    const pages = await dataSource.getRepository(KnowledgeWorkspacePageEntity).find({
      where: { traceId: `trace-docs-${source}` },
      order: { position: "ASC" },
    });
    expect(pages.map((page) => ({
      id: page.id,
      parentPageId: page.parentPageId,
      position: page.position,
    }))).toEqual([
      { id: `page-root-${source}`, parentPageId: null, position: "0001" },
      { id: `page-child-${source}`, parentPageId: `page-root-${source}`, position: "0001.0001" },
    ]);

    const collaboration = await dataSource.getRepository(KnowledgeWorkspaceCollaborationStateEntity).findOneByOrFail({
      id: `collab-child-${source}`,
    });
    expect(collaboration).toMatchObject({
      activeClientIds: ["client-a", "client-b"],
      documentState: "encoded-yjs-doc",
      provider: "yjs",
    });

    const search = await dataSource.getRepository(KnowledgeWorkspaceSearchEntryEntity).findOneByOrFail({
      id: `search-child-${source}`,
    });
    expect(search).toMatchObject({
      excerpt: "Child page used by ACP planning.",
      sourceKind: "page",
      traceId: `trace-docs-${source}`,
    });

    const savedSearch = await dataSource.getRepository(KnowledgeWorkspaceSavedSearchEntity).findOneByOrFail({
      id: `saved-search-${source}`,
    });
    expect(savedSearch).toMatchObject({
      name: "Planning context search",
      queryJson: { q: "planning", kind: "page" },
      scope: "private",
    });
  } finally {
    await dataSource.destroy();
  }
}

describe("TypeORM knowledge documents migration", () => {
  test("persists page tree, history, comments, attachments, backlinks, collaboration, and search through PGlite socket", async () => {
    await assertKnowledgeDocumentsRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("persists page tree, history, comments, attachments, backlinks, collaboration, and search through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertKnowledgeDocumentsRoundTrip("postgres", postgres.url);
  });
});
