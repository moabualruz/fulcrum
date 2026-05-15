import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import type { Session } from "better-auth";

import { createTestOrm } from "@test-support/application-database.ts";
import { Document } from "@knowledge-workspace/infrastructure/database/entities/docs/Document.ts";
import { DocVersion } from "@knowledge-workspace/infrastructure/database/entities/docs/DocVersion.ts";
import { SearchDocument } from "@knowledge-workspace/infrastructure/database/entities/search/SearchDocument.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const createCaller = t.createCallerFactory(appRouter);
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const OTHER_ORG_ID = "11111111-1111-4111-8111-111111111111";

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

function callerFor(em: import("@mikro-orm/postgresql").EntityManager, orgId = ORG_ID) {
  return createCaller(
    createContext({
      session: mockSession(USER_ID, orgId),
      orgId,
      userId: USER_ID,
      em,
      container: null,
    }),
  );
}

describe("docs CRUD tRPC", () => {
  test("create, list, get, update, soft-delete, and hard-delete docs inside the caller org", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const caller = callerFor(em);

      const created = await caller.docs.create({
        title: "My ADR",
        docType: "adr",
        scope: "project",
        bodyMd: "# Decision\n\nUse tRPC.",
        frontmatter: { status: "proposed" },
      });

      expect(created).toMatchObject({
        orgId: ORG_ID,
        title: "My ADR",
        docType: "adr",
        scope: "project",
        bodyMd: "# Decision\n\nUse tRPC.",
        frontmatter: { status: "proposed", title: "My ADR" },
        archived: false,
        parentId: null,
      });
      expect(created.slug).toMatch(/^my-adr-[a-z0-9]{6}$/);
      expect(created.contentJson).toMatchObject({ type: "doc" });

      expect(await em.count(DocVersion, { doc: created.id } as never)).toBe(1);
      expect(await em.count(SearchDocument, {
        org: ORG_ID,
        entityKind: "doc",
        entityId: created.id,
      } as never)).toBe(1);

      const listed = await caller.docs.list({ docType: "adr", archived: false });
      expect(listed.map((doc) => doc.id)).toEqual([created.id]);

      const fetchedById = await caller.docs.get({ id: created.id });
      expect(fetchedById?.slug).toBe(created.slug);

      const fetchedBySlug = await caller.docs.get({ slug: created.slug });
      expect(fetchedBySlug?.id).toBe(created.id);

      const updated = await caller.docs.update({
        id: created.id,
        title: "My ADR v2",
        bodyMd: "# Decision\n\nUse tested tRPC.",
        contentJson: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Use tested tRPC." }] }],
        },
      });

      expect(updated).toMatchObject({
        id: created.id,
        title: "My ADR v2",
        bodyMd: "# Decision\n\nUse tested tRPC.",
        frontmatter: { status: "proposed", title: "My ADR v2" },
      });
      expect(await em.count(DocVersion, { doc: created.id } as never)).toBe(2);
      expect(await em.count(SearchDocument, {
        org: ORG_ID,
        entityKind: "doc",
        entityId: created.id,
      } as never)).toBe(1);

      const archived = await caller.docs.delete({ id: created.id });
      expect(archived).toMatchObject({ id: created.id, archived: true });
      expect(await caller.docs.list()).toEqual([]);
      await expect(caller.docs.get({ id: created.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(await caller.docs.list({ archived: true })).toHaveLength(1);

      const hardDeleted = await caller.docs.delete({ id: created.id, hard: true });
      expect(hardDeleted).toEqual({ deleted: true });
      expect(await em.count(Document, { id: created.id })).toBe(0);
      expect(await em.count(DocVersion, { doc: created.id } as never)).toBe(0);
    } finally {
      await db.close();
    }
  });

  test("list filters docs by scope, docType, archived, and parentId within org", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const caller = callerFor(em);

      const parent = await caller.docs.create({ title: "Parent", docType: "wiki" });
      const child = await caller.docs.create({
        title: "Child",
        docType: "wiki",
        scope: "global",
        parentId: parent.id,
      });
      await caller.docs.create({ title: "Other", docType: "note" });

      expect((await caller.docs.list({ parentId: parent.id })).map((doc) => doc.id))
        .toEqual([child.id]);
      expect((await caller.docs.list({ scope: "global", docType: "wiki" })).map((doc) => doc.id))
        .toEqual([child.id]);
      expect(await callerFor(em, OTHER_ORG_ID).docs.list()).toEqual([]);
    } finally {
      await db.close();
    }
  });

  test("docs.get throws NOT_FOUND when requested doc is missing", async () => {
    const db = await createTestOrm();
    try {
      const caller = callerFor(db.em);
      await expect(caller.docs.get({ slug: "missing" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    } finally {
      await db.close();
    }
  });

  test("docs.list requires authentication", async () => {
    const caller = createCaller(
      createContext({
        session: null,
        orgId: null,
        userId: null,
        em: null,
        container: null,
      }),
    );

    let error: TRPCError | null = null;
    try {
      await caller.docs.list();
    } catch (caught) {
      if (caught instanceof TRPCError) error = caught;
    }

    expect(error?.code).toBe("UNAUTHORIZED");
  });
});
