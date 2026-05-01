/**
 * tRPC domain stub router tests — RED → GREEN.
 *
 * Acceptance criteria (from issue #17):
 *   1. Each stub list() procedure returns [] for an authenticated caller.
 *   2. Each stub list() returns UNAUTHORIZED for an unauthenticated caller.
 *   3. search.query() returns [] with a valid { q } input for authenticated caller.
 *   4. All stub routers are present in the AppRouter type tree.
 *
 * Per C6: NO raw SQL strings outside src/db/migrations/.
 * Per C8: needle-di Container pattern; ctx.container = null in stubs (no repo).
 */

import { describe, it, expect } from "bun:test";
import { TRPCError } from "@trpc/server";

import { appRouter } from "../../src/trpc/router.ts";
import { createContext } from "../../src/trpc/context.ts";
import { t } from "../../src/trpc/trpc.ts";

const createCaller = t.createCallerFactory(appRouter);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function mockSession(overrides?: Partial<{ id: string; userId: string; orgId: string }>) {
  return {
    id: overrides?.id ?? "sess-stub-001",
    userId: overrides?.userId ?? "user-stub-001",
    orgId: overrides?.orgId ?? "00000000-0000-0000-0000-000000000001",
    activeOrganizationId: overrides?.orgId ?? "00000000-0000-0000-0000-000000000001",
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "tok-stub-001",
    ipAddress: null,
    userAgent: null,
  };
}

function unauthenticatedCaller() {
  return createCaller(
    createContext({
      session: null,
      orgId: null,
      userId: null,
      em: null,
      container: null,
    }),
  );
}

function authenticatedCaller(
  userId = "user-stub-001",
  orgId = "00000000-0000-0000-0000-000000000001",
) {
  const session = mockSession({ userId, orgId });
  return createCaller(
    createContext({
      session: session as unknown as import("better-auth").Session,
      orgId,
      userId,
      em: null,
      container: null,
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Authenticated — all stub list() procedures return []
// ─────────────────────────────────────────────────────────────────────────────

describe("stub routers — authenticated list() returns []", () => {
  it("tasks.list returns [] for authenticated caller", async () => {
    const caller = authenticatedCaller();
    const result = await caller.tasks.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("docs.list returns [] for authenticated caller", async () => {
    const caller = authenticatedCaller();
    const result = await caller.docs.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("memory.list returns [] for authenticated caller", async () => {
    const caller = authenticatedCaller();
    const result = await caller.memory.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("runs.list returns [] for authenticated caller", async () => {
    const caller = authenticatedCaller();
    const result = await caller.runs.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("artifacts.list returns [] for authenticated caller", async () => {
    const caller = authenticatedCaller();
    const result = await caller.artifacts.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("repos.list returns [] for authenticated caller", async () => {
    const caller = authenticatedCaller();
    const result = await caller.repos.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("sprints.list returns [] for authenticated caller", async () => {
    const caller = authenticatedCaller();
    const result = await caller.sprints.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("notifications.list returns [] for authenticated caller", async () => {
    const caller = authenticatedCaller();
    const result = await caller.notifications.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("webhooks.list returns [] for authenticated caller", async () => {
    const caller = authenticatedCaller();
    const result = await caller.webhooks.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("orchestration.list returns [] for authenticated caller", async () => {
    const caller = authenticatedCaller();
    const result = await caller.orchestration.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
  // Note: flags.list is excluded here — it is a real implementation (Pillar 7) that
  // requires a DB connection (em or container). Its stub test lives in flags.test.ts.
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Unauthenticated — all stub list() procedures return UNAUTHORIZED
// ─────────────────────────────────────────────────────────────────────────────

describe("stub routers — unauthenticated list() returns UNAUTHORIZED", () => {
  const domains = [
    "tasks",
    "docs",
    "memory",
    "runs",
    "artifacts",
    "repos",
    "sprints",
    "notifications",
    "webhooks",
    "flags",
    "orchestration",
  ] as const;

  for (const domain of domains) {
    it(`${domain}.list returns UNAUTHORIZED without session`, async () => {
      const caller = unauthenticatedCaller();
      let error: TRPCError | null = null;
      try {
        await (caller[domain] as { list: () => Promise<unknown> }).list();
      } catch (e) {
        if (e instanceof TRPCError) error = e;
      }
      expect(error).not.toBeNull();
      expect(error?.code).toBe("UNAUTHORIZED");
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. search.query() stub — returns [] with valid input
// ─────────────────────────────────────────────────────────────────────────────

describe("search.query stub", () => {
  it("returns [] for authenticated caller with query string", async () => {
    const caller = authenticatedCaller();
    const result = await caller.search.query({ q: "test query" });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("returns UNAUTHORIZED for unauthenticated caller", async () => {
    const caller = unauthenticatedCaller();
    let error: TRPCError | null = null;
    try {
      await caller.search.query({ q: "test query" });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("UNAUTHORIZED");
  });
});
