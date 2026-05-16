import { describe, expect, test } from "bun:test";
import type { EntityManager } from "typeorm";
import type { Session } from "better-auth";

import { User } from "@identity-access/infrastructure/database/entities/auth/User.ts";
import { DocComment } from "@knowledge-workspace/infrastructure/database/entities/docs/DocComment.ts";
import { createTestOrm } from "@test-support/application-database.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const createCaller = t.createCallerFactory(appRouter);
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const AUTHOR_ID = "00000000-0000-4000-8000-000000000010";
const OTHER_ID = "00000000-0000-4000-8000-000000000011";
const ADMIN_ID = "00000000-0000-4000-8000-000000000012";

function mockSession(userId: string): Session {
  return {
    id: `sess-${userId.slice(-8)}`,
    userId,
    orgId: ORG_ID,
    activeOrganizationId: ORG_ID,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: `tok-${userId.slice(-8)}`,
    ipAddress: null,
    userAgent: null,
  } as unknown as Session;
}

function callerFor(em: EntityManager, userId = AUTHOR_ID) {
  return createCaller(createContext({
    session: mockSession(userId),
    orgId: ORG_ID,
    userId,
    em,
    container: null,
  }));
}

async function seedUsers(em: EntityManager): Promise<void> {
  em.persist([
    em.create(User, {
      id: AUTHOR_ID,
      orgId: ORG_ID,
      email: "comment-author@local",
      role: "member",
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    em.create(User, {
      id: OTHER_ID,
      orgId: ORG_ID,
      email: "comment-other@local",
      role: "member",
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    em.create(User, {
      id: ADMIN_ID,
      orgId: ORG_ID,
      email: "comment-admin@local",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  ]);
  /* flushed */
}

describe("docs.comments tRPC", () => {
  test("create comment, resolve, and re-open lifecycle persists anchor range", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await seedUsers(em);
      const caller = callerFor(em);
      const doc = await caller.docs.create({ title: "Commented Doc", bodyMd: "Alpha beta gamma" });

      const created = await caller.docs.comments.create({
        docId: doc.id,
        bodyMd: "Please clarify beta.",
        anchorRange: { from: 7, to: 11, text_preview: "beta" },
      });

      expect(created).toMatchObject({
        docId: doc.id,
        authorId: AUTHOR_ID,
        bodyMd: "Please clarify beta.",
        anchorRange: { from: 7, to: 11, text_preview: "beta" },
        resolved: false,
        parentCommentId: null,
        replies: [],
      });

      const resolved = await caller.docs.comments.resolve({ id: created.id, resolved: true });
      expect(resolved?.resolved).toBe(true);

      expect(await caller.docs.comments.list({ docId: doc.id })).toEqual([]);
      expect((await caller.docs.comments.list({ docId: doc.id, resolved: true })).map((comment) => comment.id))
        .toEqual([created.id]);

      const reopened = await caller.docs.comments.resolve({ id: created.id, resolved: false });
      expect(reopened?.resolved).toBe(false);
      expect((await caller.docs.comments.list({ docId: doc.id })).map((comment) => comment.id))
        .toEqual([created.id]);
    } finally {
      await db.close();
    }
  });

  test("delete root comment cascades replies", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await seedUsers(em);
      const caller = callerFor(em);
      const doc = await caller.docs.create({ title: "Threaded Doc" });
      const root = await caller.docs.comments.create({
        docId: doc.id,
        bodyMd: "Root note",
        anchorRange: { from: 1, to: 5, text_preview: "Root" },
      });
      const reply = await caller.docs.comments.create({
        docId: doc.id,
        parentCommentId: root.id,
        bodyMd: "Reply note",
      });

      expect(await em.count(DocComment, { id: { $in: [root.id, reply.id] } } as never)).toBe(2);

      await caller.docs.comments.delete({ id: root.id });

      expect(await em.count(DocComment, { id: { $in: [root.id, reply.id] } } as never)).toBe(0);
      expect(await caller.docs.comments.list({ docId: doc.id })).toEqual([]);
    } finally {
      await db.close();
    }
  });

  test("list nests replies and orders open threads by anchor position", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await seedUsers(em);
      const caller = callerFor(em);
      const doc = await caller.docs.create({ title: "Ordered Threads" });
      const later = await caller.docs.comments.create({
        docId: doc.id,
        bodyMd: "Later",
        anchorRange: { from: 20, to: 25, text_preview: "later" },
      });
      const earlier = await caller.docs.comments.create({
        docId: doc.id,
        bodyMd: "Earlier",
        anchorRange: { from: 2, to: 8, text_preview: "earlier" },
      });
      const reply = await caller.docs.comments.create({
        docId: doc.id,
        parentCommentId: earlier.id,
        bodyMd: "Nested reply",
      });

      const comments = await caller.docs.comments.list({ docId: doc.id });

      expect(comments.map((comment) => comment.id)).toEqual([earlier.id, later.id]);
      expect(comments[0]?.replies.map((nested) => nested.id)).toEqual([reply.id]);
    } finally {
      await db.close();
    }
  });

  test("delete permits author or org admin only", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await seedUsers(em);
      const author = callerFor(em, AUTHOR_ID);
      const other = callerFor(em, OTHER_ID);
      const admin = callerFor(em, ADMIN_ID);
      const doc = await author.docs.create({ title: "Delete Permissions" });
      const root = await author.docs.comments.create({ docId: doc.id, bodyMd: "Author owned" });

      await expect(other.docs.comments.delete({ id: root.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await admin.docs.comments.delete({ id: root.id })).toEqual({ deleted: true });
    } finally {
      await db.close();
    }
  });
});
