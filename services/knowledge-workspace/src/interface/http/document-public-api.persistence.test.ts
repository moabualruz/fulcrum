import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { NotFoundException } from "@nestjs/common";

import {
  KNOWLEDGE_WORKSPACE_ENTITIES,
} from "@knowledge-workspace/infrastructure/database/document.entities.ts";
import { KnowledgeDocuments1778623200004 } from "@knowledge-workspace/infrastructure/database/document.migration.ts";
import { DocumentPublicStore } from "@knowledge-workspace/infrastructure/database/document-public-store.ts";
import {
  DocumentPublicApiController,
  DocumentPublicApiService,
} from "@knowledge-workspace/interface/http/document-public-api.controller.ts";
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
const USER_ID = "77777777-7777-4777-8777-777777777777";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const DOC_ID = "44444444-4444-4444-8444-444444444444";
const LINKED_DOC_ID = "55555555-5555-4555-8555-555555555555";
const TEMPLATE_DOC_ID = "66666666-6666-4666-8666-666666666666";

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

async function assertDocumentPublicApiRoundTrip(
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
    await dataSource.runMigrations();

    await dataSource.getRepository(FulcrumWorkspaceEntity).save({
      id: ORG_ID,
      slug: `docs-public-${source}`,
      name: "Docs Public",
    });
    await dataSource.getRepository(FulcrumProjectEntity).save([
      {
        id: PROJECT_ID,
        workspaceId: ORG_ID,
        slug: `docs-public-project-${source}`,
        name: "Docs Public Project",
        traceId: `trace-doc-project-${source}`,
      },
      {
        id: OTHER_PROJECT_ID,
        workspaceId: ORG_ID,
        slug: `other-docs-public-project-${source}`,
        name: "Other Docs Public Project",
        traceId: `trace-other-doc-project-${source}`,
      },
    ]);
    await dataSource.getRepository(FulcrumDocumentEntity).save({
      id: DOC_ID,
      projectId: PROJECT_ID,
      title: "Freeform brief",
      bodyMd: "Initial freeform context",
      sourceType: "freeform",
      traceId: `trace-doc-${source}`,
    });
    await dataSource.getRepository(FulcrumDocumentEntity).save({
      id: LINKED_DOC_ID,
      projectId: PROJECT_ID,
      title: "Linked brief",
      bodyMd: "Linked context",
      sourceType: "note",
      traceId: `trace-linked-doc-${source}`,
    });
    await dataSource.getRepository(FulcrumDocumentEntity).save({
      id: TEMPLATE_DOC_ID,
      projectId: PROJECT_ID,
      title: "Note template",
      bodyMd: "Template body",
      sourceType: "template",
      traceId: `trace-template-doc-${source}`,
    });

    const controller = new DocumentPublicApiController(
      new DocumentPublicApiService(
        { featuresEnv: "public-api" },
        new DocumentPublicStore(dataSource),
      ),
    );
    const searchController = new SearchPublicApiController(
      new SearchPublicApiService(
        { featuresEnv: "public-api", authenticate },
        new SearchPublicStore(dataSource),
      ),
    );

    await expect(controller.listDocuments({ orgId: ORG_ID, projectId: PROJECT_ID })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: DOC_ID,
        projectId: PROJECT_ID,
        title: "Freeform brief",
        type: "freeform",
        bodyMd: "Initial freeform context",
      }),
    ]));
    await expect(controller.listDocuments({ orgId: ORG_ID, projectId: OTHER_PROJECT_ID })).resolves.toEqual([]);
    await expect(controller.listTemplates({ projectId: PROJECT_ID })).resolves.toEqual([
      expect.objectContaining({
        id: TEMPLATE_DOC_ID,
        title: "Note template",
        type: "template",
      }),
    ]);
    await expect(controller.resolveTemplate({ projectId: PROJECT_ID, docType: "note" })).resolves.toEqual(
      expect.objectContaining({
        docType: "note",
        template: expect.objectContaining({ id: TEMPLATE_DOC_ID }),
      }),
    );

    const created = await controller.createDocument({
      projectId: PROJECT_ID,
      title: "Planning note",
      type: "spec",
      bodyMd: "Planning context",
      frontmatter: { kind: "spec", labels: ["alpha", "beta"] },
    });
    expect(created).toEqual(expect.objectContaining({
      id: expect.any(String),
      projectId: PROJECT_ID,
      title: "Planning note",
      type: "spec",
      frontmatter: { kind: "spec", labels: ["alpha", "beta"] },
    }));

    const createdId = (created as { id: string }).id;
    await expect(searchController.search({
      q: "planning",
      org_id: ORG_ID,
      project_id: PROJECT_ID,
      kind: "page",
    }, "Bearer valid-token")).resolves.toEqual([
      expect.objectContaining({
        source_kind: "page",
        title: "Planning note",
        body: "Planning context",
      }),
    ]);
    await expect(controller.getDocument({ id: createdId })).resolves.toEqual(expect.objectContaining({
      id: createdId,
      bodyMd: "Planning context",
      frontmatter: { kind: "spec", labels: ["alpha", "beta"] },
    }));
    await expect(controller.patchDocument(
      { id: createdId },
      {
        title: "Planning note revised",
        type: "adr",
        bodyMd: "Revised",
        frontmatter: { kind: "adr", labels: ["reviewed"] },
      },
    )).resolves.toEqual(expect.objectContaining({
      id: createdId,
      title: "Planning note revised",
      type: "adr",
      bodyMd: "Revised",
      frontmatter: { kind: "adr", labels: ["reviewed"] },
    }));
    await expect(searchController.search({
      q: "revised",
      org_id: ORG_ID,
      project_id: PROJECT_ID,
      kind: "page",
    }, "Bearer valid-token")).resolves.toEqual([
      expect.objectContaining({
        source_kind: "page",
        title: "Planning note revised",
        body: "Revised",
      }),
    ]);
    await expect(controller.patchDocument(
      { id: createdId },
      { title: "Planning note final", bodyMd: "Final" },
    )).resolves.toEqual(expect.objectContaining({
      id: createdId,
      title: "Planning note final",
      bodyMd: "Final",
    }));
    const versions = await controller.listVersions({ id: createdId }) as Array<{ id: string; version: number }>;
    expect(versions).toEqual([
      expect.objectContaining({ docId: createdId, version: 2, bodyMd: "Revised" }),
      expect.objectContaining({ docId: createdId, version: 1, bodyMd: "Planning context" }),
    ]);
    const targetVersionId = versions.find((version) => version.version === 2)?.id;
    expect(targetVersionId).toEqual(expect.any(String));
    await expect(controller.getVersion({ id: createdId, version: "1" })).resolves.toEqual(
      expect.objectContaining({ docId: createdId, version: 1, title: "Planning note" }),
    );
    await expect(controller.getVersionById({
      id: createdId,
      versionId: targetVersionId!,
    })).resolves.toEqual(
      expect.objectContaining({ docId: createdId, version: 2, title: "Planning note revised" }),
    );
    await expect(controller.diffVersions(
      { id: createdId },
      { fromVersion: "1", toVersion: "2" },
    )).resolves.toEqual(expect.objectContaining({
      docId: createdId,
      titleChanged: true,
      bodyChanged: true,
      bodyMdBefore: "Planning context",
      bodyMdAfter: "Revised",
    }));
    await expect(controller.diffVersionById({
      id: createdId,
      versionId: targetVersionId!,
    })).resolves.toEqual(expect.objectContaining({
      docId: createdId,
      versionId: targetVersionId,
      hasDiff: true,
      bodyMdBefore: "Planning context",
      bodyMdAfter: "Revised",
    }));
    await expect(controller.restoreVersionById({
      id: createdId,
      versionId: targetVersionId!,
    })).resolves.toEqual(
      expect.objectContaining({
        id: createdId,
        title: "Planning note revised",
        bodyMd: "Revised",
      }),
    );
    await expect(controller.restoreVersion({ id: createdId, version: "1" })).resolves.toEqual(
      expect.objectContaining({
        id: createdId,
        title: "Planning note",
        bodyMd: "Planning context",
      }),
    );

    const comment = await controller.createComment(
      { id: DOC_ID },
      {
        authorId: "user-doc-comment",
        bodyMd: "Review this context",
        traceId: `trace-comment-${source}`,
      },
    ) as { id: string; bodyMd: string; status: string; docId: string };
    expect(comment).toEqual(expect.objectContaining({
      docId: DOC_ID,
      bodyMd: "Review this context",
      status: "open",
    }));
    await expect(controller.listComments({ id: DOC_ID }, { resolved: "false" })).resolves.toEqual([
      expect.objectContaining({ id: comment.id, status: "open" }),
    ]);
    await expect(controller.patchComment(
      { commentId: comment.id },
      { bodyMd: "Updated review note" },
    )).resolves.toEqual(expect.objectContaining({
      id: comment.id,
      bodyMd: "Updated review note",
    }));
    await expect(controller.resolveComment({ commentId: comment.id }, { resolved: true })).resolves.toEqual(
      expect.objectContaining({ id: comment.id, status: "resolved" }),
    );

    const attachment = await controller.createAttachment(
      { id: DOC_ID },
      {
        fileName: "context-brief.pdf",
        mimeType: "application/pdf",
        sizeBytes: 128,
        storagePath: `doc-attachments/${source}/context-brief.pdf`,
        checksumSha256: `checksum-${source}`,
        traceId: `trace-attachment-${source}`,
      },
    ) as { id: string; docId: string; fileName: string; sizeBytes: number };
    expect(attachment).toEqual(expect.objectContaining({
      docId: DOC_ID,
      fileName: "context-brief.pdf",
      mimeType: "application/pdf",
      sizeBytes: 128,
    }));
    await expect(controller.listAttachments({ id: DOC_ID })).resolves.toEqual([
      expect.objectContaining({
        id: attachment.id,
        docId: DOC_ID,
        fileName: "context-brief.pdf",
        storagePath: `doc-attachments/${source}/context-brief.pdf`,
      }),
    ]);
    const collaborationState = await controller.patchCollaborationState(
      { id: DOC_ID, provider: "hocuspocus" },
      {
        stateVector: `state-vector-${source}`,
        documentState: `document-state-${source}`,
        activeClientIds: ["client-a", "client-b"],
        traceId: `trace-collaboration-${source}`,
      },
    ) as { id: string; provider: string };
    expect(collaborationState).toEqual(expect.objectContaining({
      docId: DOC_ID,
      provider: "hocuspocus",
      stateVector: `state-vector-${source}`,
      documentState: `document-state-${source}`,
      activeClientIds: ["client-a", "client-b"],
    }));
    await expect(controller.listCollaborationStates({ id: DOC_ID })).resolves.toEqual([
      expect.objectContaining({
        id: collaborationState.id,
        docId: DOC_ID,
        provider: "hocuspocus",
      }),
    ]);

    const link = await controller.createLink({
      sourceDocId: DOC_ID,
      targetDocId: LINKED_DOC_ID,
      linkType: "wikilink",
      traceId: `trace-link-${source}`,
    }) as { id: string };
    expect(link).toEqual(expect.objectContaining({
      sourceDocId: DOC_ID,
      targetDocId: LINKED_DOC_ID,
      linkType: "wikilink",
    }));
    await expect(controller.listForwardLinks({ id: DOC_ID })).resolves.toEqual([
      expect.objectContaining({
        sourceDocId: DOC_ID,
        targetDocId: LINKED_DOC_ID,
        linkType: "wikilink",
      }),
    ]);
    await expect(controller.listBacklinks({ id: LINKED_DOC_ID })).resolves.toEqual([
      expect.objectContaining({
        sourceDocId: DOC_ID,
        targetDocId: LINKED_DOC_ID,
        linkType: "wikilink",
      }),
    ]);
    await expect(controller.deleteLink({ linkId: link.id })).resolves.toBeUndefined();
    await expect(controller.listForwardLinks({ id: DOC_ID })).resolves.toEqual([]);
    await expect(controller.deleteAttachment({ attachmentId: attachment.id })).resolves.toBeUndefined();
    await expect(controller.listAttachments({ id: DOC_ID })).resolves.toEqual([]);
    await expect(controller.deleteCollaborationState({
      id: DOC_ID,
      provider: "hocuspocus",
    })).resolves.toBeUndefined();
    await expect(controller.listCollaborationStates({ id: DOC_ID })).resolves.toEqual([]);
    await expect(controller.deleteComment({ commentId: comment.id })).resolves.toBeUndefined();
    await expect(controller.listComments({ id: DOC_ID }, {})).resolves.toEqual([]);

    await expect(controller.deleteDocument({ id: createdId })).resolves.toBeUndefined();
    await expect(searchController.search({
      q: "planning",
      org_id: ORG_ID,
      project_id: PROJECT_ID,
      kind: "page",
    }, "Bearer valid-token")).resolves.toEqual([]);
    await expect(controller.getDocument({ id: createdId })).rejects.toBeInstanceOf(NotFoundException);
  } finally {
    await dataSource.destroy();
  }
}

describe("document public API TypeORM persistence", () => {
  test("serves document CRUD through PGlite socket", async () => {
    await assertDocumentPublicApiRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("serves document CRUD through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertDocumentPublicApiRoundTrip("postgres", postgres.url);
  });
});
