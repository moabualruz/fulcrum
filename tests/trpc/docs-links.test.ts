import { describe, expect, test } from "bun:test";
import type { Session } from "better-auth";

import { createTestOrm } from "../../src/test-utils/db.ts";
import { appRouter } from "../../src/trpc/router.ts";
import { createContext } from "../../src/trpc/context.ts";
import { t } from "../../src/trpc/trpc.ts";

const createCaller = t.createCallerFactory(appRouter);
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";

function mockSession(): Session {
  return {
    id: "sess-doc-links",
    userId: USER_ID,
    orgId: ORG_ID,
    activeOrganizationId: ORG_ID,
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "tok-doc-links",
    ipAddress: null,
    userAgent: null,
  } as unknown as Session;
}

function callerFor(em: import("@mikro-orm/postgresql").EntityManager) {
  return createCaller(createContext({
    session: mockSession(),
    orgId: ORG_ID,
    userId: USER_ID,
    em,
    container: null,
  }));
}

function docWithWikilink(slug: string): Record<string, unknown> {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "wikilink", attrs: { slug } }] }],
  };
}

describe("docs.links tRPC", () => {
  test("listBacklinks returns org-scoped docs linking to current doc", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const caller = callerFor(em);
      const target = await caller.docs.create({ title: "Target Doc" });
      const source = await caller.docs.create({ title: "Source Doc" });
      await caller.docs.create({ title: "Unrelated Doc" });

      await caller.docs.update({ id: source.id, contentJson: docWithWikilink(target.slug) });

      const backlinks = await caller.docs.links.listBacklinks({ docId: target.id });
      expect(backlinks).toEqual([{
        fromDocId: source.id,
        title: "Source Doc",
        slug: source.slug,
        linkKind: "wikilink",
      }]);
    } finally {
      await db.close();
    }
  });

  test("listForwardLinks returns outbound wikilinks for current doc", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const caller = callerFor(em);
      const target = await caller.docs.create({ title: "Target Doc" });
      const source = await caller.docs.create({ title: "Source Doc" });

      await caller.docs.update({ id: source.id, contentJson: docWithWikilink(target.slug) });

      const forwardLinks = await caller.docs.links.listForwardLinks({ docId: source.id });
      expect(forwardLinks).toEqual([{
        toDocId: target.id,
        toSlug: target.slug,
        linkKind: "wikilink",
      }]);
    } finally {
      await db.close();
    }
  });
});
