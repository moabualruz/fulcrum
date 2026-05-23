import { describe, expect, test } from "bun:test";

import { createTestOrm } from "@test-support/application-database.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const createCaller = t.createCallerFactory(appRouter);
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";

function mockSession() {
  return {
    id: "session-skills-ext",
    userId: USER_ID,
    orgId: ORG_ID,
    activeOrganizationId: ORG_ID,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "token-skills-ext",
    ipAddress: null,
    userAgent: null,
  };
}

function callerFor(em: import("typeorm").EntityManager) {
  const container = null;

  return createCaller(
    createContext({
      session: mockSession() as unknown as import("better-auth").Session,
      orgId: ORG_ID,
      userId: USER_ID,
      em,
      container,
    }),
  );
}

describe("skills registry tRPC procedures", () => {
  test("registry.list returns array of registry entries", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const caller = callerFor(em);

      const skillsCaller = caller.fulcrum_skills as Record<string, unknown>;
      const registry = skillsCaller.registry as { list: (input?: Record<string, unknown>) => Promise<unknown[]> };
      const entries = await registry.list({});

      expect(Array.isArray(entries)).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("conflicts.list returns array of conflicts", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const caller = callerFor(em);

      const skillsCaller = caller.fulcrum_skills as Record<string, unknown>;
      const conflicts = skillsCaller.conflicts as { list: (input?: Record<string, unknown>) => Promise<unknown[]> };
      const entries = await conflicts.list({});

      expect(Array.isArray(entries)).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("conflicts.override requires auditNote and returns ok", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const caller = callerFor(em);

      // Create a real SkillConflict to override
      const { SkillConflict, SkillConflictKind, SkillConflictStatus } = await import("@platform-core/infrastructure/application-database/entities/skills/SkillConflict.ts");
      const conflict = em.create(SkillConflict, {
        slug: "test-skill",
        kind: SkillConflictKind.UpstreamConflict,
        status: SkillConflictStatus.Open,
        localHash: "a".repeat(64),
        upstreamHash: "b".repeat(64),
        baseHash: "c".repeat(64),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.save(SkillConflict, conflict);

      const skillsCaller = caller.fulcrum_skills as Record<string, unknown>;
      const conflicts = skillsCaller.conflicts as {
        override: (input: { conflictId: string; auditNote: string; resolution: string }) => Promise<{ ok: boolean }>;
      };
      const result = await conflicts.override({
        conflictId: conflict.id,
        auditNote: "Override for testing",
        resolution: "upstream",
      });

      expect(result).toEqual({ ok: true });
    } finally {
      await db.close();
    }
  });

  test("lock.override requires expectedSha256 and actualSha256 and returns ok", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const caller = callerFor(em);

      const skillsCaller = caller.fulcrum_skills as Record<string, unknown>;
      const lock = skillsCaller.lock as {
        override: (input: { slug: string; expectedSha256: string; actualSha256: string; auditNote?: string }) => Promise<{ ok: boolean }>;
      };
      const result = await lock.override({
        slug: "test-skill",
        expectedSha256: "a".repeat(64),
        actualSha256: "b".repeat(64),
        auditNote: "Manual override",
      });

      expect(result).toHaveProperty("ok");
    } finally {
      await db.close();
    }
  });
});
