import { describe, expect, test } from "bun:test";

import { DocLink } from "@platform-core/infrastructure/application-database/entities/docs/DocLink.ts";
import { createTestOrm } from "@test-support/application-database.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import type { Session } from "better-auth";

const createCaller = t.createCallerFactory(appRouter);
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";

function mockSession(): Session {
  return {
    id: "sess-wikilinks",
    userId: USER_ID,
    orgId: ORG_ID,
    activeOrganizationId: ORG_ID,
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "tok-wikilinks",
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

function docWithWikilinks(slugs: string[]): Record<string, unknown> {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: slugs.map((slug) => ({ type: "wikilink", attrs: { slug } })),
      },
    ],
  };
}

describe("wikilink extraction", () => {
  test("docs.update upserts wikilinks idempotently", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const caller = callerFor(em);
      const target = await caller.docs.create({ title: "Target Doc" });
      const source = await caller.docs.create({ title: "Source Doc" });

      await caller.docs.update({ id: source.id, contentJson: docWithWikilinks([target.slug]) });
      await caller.docs.update({ id: source.id, contentJson: docWithWikilinks([target.slug]) });

      const links = await em.find(DocLink, { fromDoc: source.id } as never, { populate: ["toDoc"] });
      expect(links).toHaveLength(1);
      expect(links[0]?.toSlug).toBe(target.slug);
      expect(links[0]?.toDoc?.id).toBe(target.id);
      expect(links[0]?.linkKind).toBe("wikilink");
    } finally {
      await db.close();
    }
  });

  test("docs.update removes stale wikilinks", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const caller = callerFor(em);
      const keep = await caller.docs.create({ title: "Keep Doc" });
      const stale = await caller.docs.create({ title: "Stale Doc" });
      const source = await caller.docs.create({ title: "Source Doc" });

      await caller.docs.update({ id: source.id, contentJson: docWithWikilinks([keep.slug, stale.slug]) });
      await caller.docs.update({ id: source.id, contentJson: docWithWikilinks([keep.slug]) });

      const links = await em.find(DocLink, { fromDoc: source.id } as never);
      expect(links.map((link) => link.toSlug)).toEqual([keep.slug]);
    } finally {
      await db.close();
    }
  });
});
