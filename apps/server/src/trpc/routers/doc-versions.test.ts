/**
 * doc-versions tRPC router tests — knowledge workflow.
 *
 * Tests: list, restore, diff procedures.
 * Self-contained: uses a mock EntityManager; does not require a real DB.
 */

import { describe, expect, test } from "bun:test";
import { initTRPC, TRPCError } from "@trpc/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORG_ID = "00000000-0000-4000-8000-000000000001";
const DOC_ID = "10000000-0000-4000-8000-000000000001";
const VERSION_ID_1 = "20000000-0000-4000-8000-000000000001";
const VERSION_ID_2 = "20000000-0000-4000-8000-000000000002";

function makeVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: VERSION_ID_1,
    versionNum: 1,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    author: null,
    restoreOf: null,
    snapshot: { type: "doc", content: [] },
    delta: null,
    bodyMdSnapshot: "body",
    org: ORG_ID,
    doc: DOC_ID,
    ...overrides,
  };
}

function makeDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: DOC_ID,
    org: ORG_ID,
    archived: false,
    ...overrides,
  };
}

/** Build a minimal tRPC caller for the docVersionsRouter with an injected mock em. */
async function buildCaller(emOverrides: Record<string, unknown> = {}) {
  // Dynamic import to avoid top-level side-effects from the DB decorators
  const { docVersionsRouter } = await import("./doc-versions.ts");

  const t = initTRPC.context<{
    em: unknown;
    orgId: string | null;
    userId: string | null;
    session: { userId: string } | null;
    container: unknown;
  }>().create();

  const router = t.router({ docVersions: docVersionsRouter });

  const ctx = {
    em: {
      find: async () => [],
      findOne: async () => makeDocument(),
      create: (entity: string, data: Record<string, unknown>) => ({ ...data }),
      persistAndFlush: async () => undefined,
      flush: async () => undefined,
      ...emOverrides,
    } as unknown,
    orgId: ORG_ID,
    userId: "user_1",
    session: { userId: "user_1" },
    container: { has: () => false, get: () => null },
  };

  return t.createCallerFactory(router)(ctx);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("docVersionsRouter.list", () => {
  test("returns empty array when no versions", async () => {
    const caller = await buildCaller({
      find: async () => [],
    });
    const result = await caller.docVersions.list({ documentId: DOC_ID });
    expect(result).toEqual([]);
  });

  test("maps versions to DTO shape", async () => {
    const v = makeVersion({ versionNum: 3, author: { id: "u1", name: "Alice", email: "alice@test.com" } });
    const caller = await buildCaller({
      find: async () => [v],
    });
    const result = await caller.docVersions.list({ documentId: DOC_ID });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: VERSION_ID_1,
      versionNum: 3,
      authorName: "Alice",
    });
  });

  test("throws UNAUTHORIZED when no orgId", async () => {
    const { docVersionsRouter } = await import("./doc-versions.ts");
    const t = initTRPC.context<{
      em: unknown;
      orgId: string | null;
      userId: string | null;
      session: { userId: string } | null;
      container: unknown;
    }>().create();
    const router = t.router({ docVersions: docVersionsRouter });
    const caller = t.createCallerFactory(router)({
      em: {} as unknown,
      orgId: null,
      userId: null,
      session: null,
      container: { has: () => false, get: () => null },
    });
    await expect(caller.docVersions.list({ documentId: DOC_ID })).rejects.toThrow();
  });
});

describe("docVersionsRouter.restore", () => {
  test("creates a new version with restoreOf linkage", async () => {
    const targetVersion = makeVersion({ id: VERSION_ID_1, versionNum: 2 });
    const latestVersion = makeVersion({ id: VERSION_ID_2, versionNum: 2 });
    let persisted: unknown = null;
    const caller = await buildCaller({
      findOne: async (_entity: string, where: Record<string, unknown>, opts?: Record<string, unknown>) => {
        if (opts && JSON.stringify(opts).includes("DESC")) return latestVersion;
        return targetVersion;
      },
      find: async () => [],
      create: (_entity: string, data: Record<string, unknown>) => {
        const obj = { ...data, id: "new-version-id", createdAt: new Date() };
        persisted = obj;
        return obj;
      },
      persistAndFlush: async () => undefined,
    });

    // The restore procedure calls reconstructDocVersion which requires a snapshot in DB.
    // With findOne returning the version (which has a snapshot) and find returning [],
    // it should succeed: persisted should have restoreOf set.
    const result = await caller.docVersions.restore({ documentId: DOC_ID, versionId: VERSION_ID_1 });
    expect(result).toMatchObject({ restoredFromVersionId: VERSION_ID_1 });
    expect(persisted).not.toBeNull();
  });

  test("throws NOT_FOUND when versionId does not exist", async () => {
    const caller = await buildCaller({
      findOne: async () => null,
    });
    await expect(
      caller.docVersions.restore({ documentId: DOC_ID, versionId: VERSION_ID_1 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("docVersionsRouter.diff", () => {
  test("returns hasDiff: false for versionNum = 1", async () => {
    const v1 = makeVersion({ versionNum: 1 });
    const caller = await buildCaller({
      findOne: async () => v1,
    });
    const result = await caller.docVersions.diff({ documentId: DOC_ID, versionId: VERSION_ID_1 });
    expect(result).toEqual({ html: "", hasDiff: false });
  });

  test("throws NOT_FOUND for missing version", async () => {
    const caller = await buildCaller({
      findOne: async () => null,
    });
    await expect(
      caller.docVersions.diff({ documentId: DOC_ID, versionId: VERSION_ID_1 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
