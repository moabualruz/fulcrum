import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import type { Session } from "better-auth";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Memory } from "@knowledge-workspace/infrastructure/database/entities/memory/Memory.ts";
import type { EntityManager } from "typeorm";

import { createTestOrm } from "@test-support/application-database.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import { rankMemoryMatches } from "@knowledge-workspace/application/memory/retrieval/scoring.ts";

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

function callerFor(
  em: EntityManager,
  orgId = ORG_ID,
) {
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

describe("memory tRPC CRUD and search", () => {
  test("create, get, list, update, delete memories inside the caller org", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const caller = callerFor(em);
      const projectId = "22222222-2222-4222-8222-222222222222";

      const created = await caller.memories.create({
        projectId,
        global: false,
        kind: "decision",
        body: "Use deterministic BM25 memory retrieval.",
        tags: ["retrieval", "memory"],
        importance: "high",
      });

      expect(created).toMatchObject({
        orgId: ORG_ID,
        projectId,
        global: false,
        kind: "decision",
        body: "Use deterministic BM25 memory retrieval.",
        tags: ["retrieval", "memory"],
        importance: "high",
        source: "manual",
        archived: false,
      });

      expect(await caller.memories.get({ id: created.id })).toMatchObject({
        id: created.id,
        body: created.body,
      });
      expect((await caller.memories.list({ projectId })).map((memory) => memory.id))
        .toEqual([created.id]);
      expect((await caller.memories.list({ tags: ["memory"], importance: "high" })).map((memory) => memory.id))
        .toEqual([created.id]);

      const updated = await caller.memories.update({
        id: created.id,
        body: "Use deterministic local BM25 memory retrieval.",
        tags: ["retrieval", "local"],
        importance: "medium",
      });

      expect(updated).toMatchObject({
        id: created.id,
        body: "Use deterministic local BM25 memory retrieval.",
        tags: ["retrieval", "local"],
        importance: "medium",
      });

      await expect(caller.memories.delete({ id: created.id })).resolves.toEqual({
        deleted: true,
      });
      await expect(caller.memories.get({ id: created.id })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    } finally {
      await db.close();
    }
  });

  test("create rejects non-manual client source values", async () => {
    const db = await createTestOrm();
    try {
      const caller = callerFor(db.em);

      await expect(caller.memories.create({
        body: "Hook-owned memory",
        source: "heuristic",
      } as unknown as Parameters<typeof caller.memories.create>[0])).rejects.toBeInstanceOf(Error);
    } finally {
      await db.close();
    }
  });

  test("update requires forceEdit for heuristic or llm memories", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const memory = em.create(Memory, {
        org: em.getReference(Org, ORG_ID),
        body: "Heuristic extracted fact",
        source: "heuristic",
      });
      await em.save(memory);

      const caller = callerFor(em);
      await expect(caller.memories.update({ id: memory.id, body: "Manual edit" }))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.memories.update({ id: memory.id, body: "Manual edit", forceEdit: true }))
        .resolves.toMatchObject({ id: memory.id, body: "Manual edit" });
    } finally {
      await db.close();
    }
  });

  test("all procedures enforce org isolation", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const caller = callerFor(em);
      const otherOrgCaller = callerFor(em, OTHER_ORG_ID);
      const created = await caller.memories.create({ body: "Org scoped memory" });

      await expect(otherOrgCaller.memories.get({ id: created.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(otherOrgCaller.memories.update({ id: created.id, body: "Nope" })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(otherOrgCaller.memories.delete({ id: created.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(await otherOrgCaller.memories.list()).toEqual([]);
    } finally {
      await db.close();
    }
  });

  test("search ranks matching memories with BM25 scoring", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const caller = callerFor(em);
      const older = new Date("2026-04-01T00:00:00.000Z");
      const newer = new Date("2026-05-01T00:00:00.000Z");

      const rows = [
        em.create(Memory, {
          org: em.getReference(Org, ORG_ID),
          body: "alpha beta",
          source: "manual",
          importance: "medium",
          createdAt: older,
        }),
        em.create(Memory, {
          org: em.getReference(Org, ORG_ID),
          body: "alpha alpha alpha beta",
          source: "manual",
          importance: "medium",
          createdAt: newer,
        }),
        em.create(Memory, {
          org: em.getReference(Org, ORG_ID),
          body: "unrelated",
          source: "manual",
          importance: "low",
          createdAt: newer,
        }),
      ];
      await em.save(rows);

      const result = await caller.memories.search({
        query: "alpha",
        topK: 2,
        now: "2026-05-03T12:00:00.000Z",
      });
      const direct = rankMemoryMatches("alpha", rows, {
        topK: 2,
        now: new Date("2026-05-03T12:00:00.000Z"),
      });

      const firstResult = result[0];
      const firstDirect = direct[0];
      expect(firstResult).toBeDefined();
      expect(firstDirect).toBeDefined();
      if (!firstResult || !firstDirect) throw new Error("expected ranked memory");
      expect(result.map((row) => row.id)).toEqual(direct.map((row) => row.memory.id));
      expect(firstResult.score).toBeCloseTo(firstDirect.score, 6);
      expect(firstResult.textRank).toBeGreaterThan(0);
    } finally {
      await db.close();
    }
  });

  test("memory.list requires authentication", async () => {
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
      await caller.memories.list();
    } catch (caught) {
      if (caught instanceof TRPCError) error = caught;
    }

    expect(error?.code).toBe("UNAUTHORIZED");
  });
});
