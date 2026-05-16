import { describe, expect, test } from "bun:test";
import type { EntityManager } from "typeorm";
import type { Session } from "better-auth";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Document } from "@knowledge-workspace/infrastructure/database/entities/docs/Document.ts";
import { DocVersion } from "@knowledge-workspace/infrastructure/database/entities/docs/DocVersion.ts";
import { reconstructDocVersion } from "@knowledge-workspace/application/docs/version-reconstructor.ts";
import { writeDocVersion } from "@knowledge-workspace/application/docs/version-writer.ts";
import { createTestOrm } from "@test-support/application-database.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
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

function callerFor(em: EntityManager, orgId = ORG_ID) {
  return createCaller(createContext({
    session: mockSession(USER_ID, orgId),
    orgId,
    userId: USER_ID,
    em,
    container: null,
  }));
}

function content(text: string): Record<string, unknown> {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

async function createDoc(em: EntityManager): Promise<Document> {
  const doc = em.create(Document, {
    org: em.getReference(Org, ORG_ID),
    frontmatter: { title: "Versioned Doc" },
    bodyMd: "Version 0",
    contentJson: content("Version 0"),
    externalId: "versioned-doc",
    updatedAt: new Date("2026-05-03T10:00:00Z"),
  });
  await em.save(doc);
  return doc;
}

describe("doc version history engine", () => {
  test("writer stores first and every tenth save as snapshots and other saves as deltas", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const doc = await createDoc(em);

      for (let i = 1; i <= 12; i += 1) {
        doc.bodyMd = `Version ${i}`;
        doc.contentJson = content(`Version ${i}`);
        await writeDocVersion(em, {
          orgId: ORG_ID,
          doc,
          now: new Date("2026-05-03T10:00:00Z"),
        });
        /* flushed */
      }

      const versions = await em.find(DocVersion, { doc: doc.id } as never, {
        orderBy: { versionNum: "ASC" },
      });

      expect(versions).toHaveLength(12);
      expect(versions.map((version) => version.versionNum)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      expect(versions.filter((version) => version.snapshot !== null).map((version) => version.versionNum)).toEqual([1, 10]);
      expect(versions.filter((version) => version.delta !== null).map((version) => version.versionNum)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 11, 12]);
      expect(versions.every((version) => version.bodyMdSnapshot === `Version ${version.versionNum}`)).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("reconstructor rebuilds arbitrary versions byte-stably from nearest prior snapshot", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const doc = await createDoc(em);
      const originals = new Map<number, Record<string, unknown>>();

      for (let i = 1; i <= 12; i += 1) {
        const next = content(`Version ${i}`);
        originals.set(i, next);
        doc.bodyMd = `Version ${i}`;
        doc.contentJson = next;
        await writeDocVersion(em, {
          orgId: ORG_ID,
          doc,
          now: new Date("2026-05-03T10:00:00Z"),
        });
        /* flushed */
      }

      for (const versionNum of [1, 5, 10, 12]) {
        const reconstructed = await reconstructDocVersion(em, {
          orgId: ORG_ID,
          docId: doc.id,
          versionNum,
        });
        expect(reconstructed.contentJson).toEqual(originals.get(versionNum)!);
        expect(reconstructed.bodyMd).toBe(`Version ${versionNum}`);
      }
    } finally {
      await db.close();
    }
  });

  test("writer falls back to snapshot when large-document delta computation exceeds threshold", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const doc = await createDoc(em);
      const slowDeltaCount = { value: 0 };

      doc.bodyMd = "A".repeat(510_000);
      doc.contentJson = { text: "A".repeat(510_000) };
      await writeDocVersion(em, {
        orgId: ORG_ID,
        doc,
        now: new Date("2026-05-03T10:00:00Z"),
      });
      /* flushed */

      doc.bodyMd = "B".repeat(510_000);
      doc.contentJson = { text: "B".repeat(510_000) };
      await writeDocVersion(em, {
        orgId: ORG_ID,
        doc,
        now: new Date("2026-05-03T10:00:00Z"),
        deltaElapsedMs: () => 201,
        slowDeltaCount,
      });
      /* flushed */

      const version = await em.findOneOrFail(DocVersion, { doc: doc.id, versionNum: 2 } as never);
      expect(version.snapshot).toEqual(doc.contentJson);
      expect(version.delta).toBeNull();
      expect(slowDeltaCount.value).toBe(1);
    } finally {
      await db.close();
    }
  });

  test("docs.versions list/get/diff/restore are org-scoped and restore is non-destructive", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const caller = callerFor(em);
      const doc = await caller.docs.create({
        title: "Restore Doc",
        bodyMd: "Version 1",
        contentJson: content("Version 1"),
      });

      const originals = new Map<number, { bodyMd: string; contentJson: Record<string, unknown> }>([
        [1, { bodyMd: "Version 1", contentJson: content("Version 1") }],
      ]);
      for (let i = 2; i <= 6; i += 1) {
        const bodyMd = `Version ${i}`;
        const contentJson = content(bodyMd);
        originals.set(i, { bodyMd, contentJson });
        await caller.docs.update({ id: doc.id, bodyMd, contentJson });
      }

      const listed = await caller.docs.versions.list({ docId: doc.id });
      expect(listed.map((version) => version.versionNum)).toEqual([6, 5, 4, 3, 2, 1]);
      expect(listed.at(-1)).toMatchObject({ versionNum: 1, isSnapshot: true, authorId: null });

      const version5 = await caller.docs.versions.get({ docId: doc.id, versionNum: 5 });
      expect(version5).toMatchObject({ versionNum: 5, bodyMdSnapshot: "Version 5" });

      const diff = await caller.docs.versions.diff({
        docId: doc.id,
        fromVersionNum: 5,
        toVersionNum: 6,
      });
      expect(diff.html).toContain("Version 5");
      expect(diff.html).toContain("Version 6");

      const restored = await caller.docs.versions.restore({ docId: doc.id, versionNum: 5 });
      expect(restored.bodyMd).toBe(originals.get(5)!.bodyMd);
      expect(restored.contentJson).toEqual(originals.get(5)!.contentJson);

      const afterRestore = await em.find(DocVersion, { doc: doc.id } as never, {
        populate: ["restoreOf"],
        orderBy: { versionNum: "ASC" },
      });
      expect(afterRestore).toHaveLength(7);
      expect(afterRestore.at(-1)?.versionNum).toBe(7);
      expect(afterRestore.at(-1)?.restoreOf?.versionNum).toBe(5);

      await expect(callerFor(em, OTHER_ORG_ID).docs.versions.list({ docId: doc.id })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    } finally {
      await db.close();
    }
  });

  test("restore over 50 versions stays under the PGlite latency budget", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const caller = callerFor(em);
      const doc = await caller.docs.create({
        title: "Performance Doc",
        bodyMd: "Version 1",
        contentJson: content("Version 1"),
      });

      for (let i = 2; i <= 50; i += 1) {
        await caller.docs.update({
          id: doc.id,
          bodyMd: `Version ${i}`,
          contentJson: content(`Version ${i}`),
        });
      }

      const startedAt = performance.now();
      const restored = await caller.docs.versions.restore({ docId: doc.id, versionNum: 49 });
      const elapsedMs = performance.now() - startedAt;

      expect(restored.bodyMd).toBe("Version 49");
      expect(elapsedMs).toBeLessThan(150);
    } finally {
      await db.close();
    }
  });
});
