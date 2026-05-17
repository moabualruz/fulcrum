import { describe, expect, test } from "bun:test";
import type { Session } from "better-auth";

import { createTestOrm } from "@test-support/application-database.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const createCaller = t.createCallerFactory(appRouter);
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";

function mockSession(userId: string, orgId: string): Session {
  return {
    id: `sess-${userId.slice(-8)}`,
    userId,
    orgId,
    activeOrganizationId: orgId,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: `tok-${userId.slice(-8)}`,
    ipAddress: null,
    userAgent: null,
  } as unknown as Session;
}

function callerFor(em: import("typeorm").EntityManager) {
  return createCaller(
    createContext({
      session: mockSession(USER_ID, ORG_ID),
      orgId: ORG_ID,
      userId: USER_ID,
      em,
      container: null,
    }),
  );
}

async function installP11SearchColumns(em: import("typeorm").EntityManager) {
  await em.getConnection().execute(`
    ALTER TABLE search_documents ADD COLUMN IF NOT EXISTS project_id uuid NULL;
    ALTER TABLE search_documents ADD COLUMN IF NOT EXISTS source_kind text;
    ALTER TABLE search_documents ADD COLUMN IF NOT EXISTS source_id text;
    ALTER TABLE search_documents ADD COLUMN IF NOT EXISTS title text;
    ALTER TABLE search_documents ADD COLUMN IF NOT EXISTS body text;
    ALTER TABLE search_documents ADD COLUMN IF NOT EXISTS labels text[] NOT NULL DEFAULT '{}';
    ALTER TABLE search_documents ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE search_documents ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
    ALTER TABLE search_documents ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
    UPDATE search_documents SET source_kind = entity_kind WHERE source_kind IS NULL;
    UPDATE search_documents SET source_id = entity_id WHERE source_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS search_documents_org_kind_entity_unique
      ON search_documents (org_id, source_kind, source_id);
  `);
}

async function searchRow(em: import("typeorm").EntityManager, docId: string) {
  const rows = await em.query(
    `SELECT source_kind, source_id, entity_kind, entity_id, title, body, labels, metadata, archived
       FROM search_documents
      WHERE org_id = $1 AND source_kind = 'doc' AND source_id = $2`,
    [ORG_ID, docId],
  ) as Array<{
    source_kind: string | null;
    source_id: string | null;
    entity_kind: string;
    entity_id: string;
    title: string | null;
    body: string | null;
    labels: string | string[];
    metadata: Record<string, unknown> | string;
    archived: boolean;
  }>;
  if (!rows[0]) return undefined;
  const row = rows[0];
  return {
    ...row,
    labels: typeof row.labels === "string" ? row.labels.replace(/[{}]/g, "").split(",").filter(Boolean) : row.labels,
    metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata,
  };
}

describe("docs search index hook", () => {
  test("indexes on doc save", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await installP11SearchColumns(em);
      const caller = callerFor(em);

      const created = await caller.docs.create({
        title: "Search ADR",
        docType: "adr",
        bodyMd: "# Decision\n\nUse **fast** [[search]].",
        frontmatter: { tags: ["search", "adr"] },
      });

      const row = await searchRow(em, created.id);
      expect(row).toMatchObject({
        source_kind: "doc",
        source_id: created.id,
        entity_kind: "doc",
        entity_id: created.id,
        title: "Search ADR",
        labels: ["search", "adr"],
        metadata: { doc_type: "adr", scope: "project", author_id: USER_ID },
        archived: false,
      });
      expect(row?.body).toBe("Decision Use fast search.");
    } finally {
      await db.close();
    }
  });

  test("updates index on doc edit", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await installP11SearchColumns(em);
      const caller = callerFor(em);

      const created = await caller.docs.create({
        title: "Old title",
        bodyMd: "Old body",
      });
      await caller.docs.update({
        id: created.id,
        title: "New title",
        bodyMd: "New **body**",
        frontmatter: { tags: ["updated"] },
      });

      const row = await searchRow(em, created.id);
      expect(row?.title).toBe("New title");
      expect(row?.body).toBe("New body");
      expect(row?.labels).toEqual(["updated"]);
    } finally {
      await db.close();
    }
  });

  test("archives index row on soft delete and removes it on hard delete", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await installP11SearchColumns(em);
      const caller = callerFor(em);

      const created = await caller.docs.create({ title: "Delete me" });
      await caller.docs.delete({ id: created.id });

      expect((await searchRow(em, created.id))?.archived).toBe(true);

      await caller.docs.delete({ id: created.id, hard: true });
      expect(await searchRow(em, created.id)).toBeUndefined();
    } finally {
      await db.close();
    }
  });
});
