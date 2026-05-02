/**
 * tRPC core router tests — RED → GREEN.
 *
 * Acceptance criteria (from issue #06):
 *   1. Calling a protected procedure without a valid session returns UNAUTHORIZED.
 *   2. Calling a protected procedure with a session succeeds (returns data).
 *   3. ctx.orgId + ctx.userId populated on every authenticated call.
 *   4. publicProcedure (health.ping) accessible without session.
 *
 * Per C6: NO raw SQL strings outside src/db/migrations/.
 * Per C8: needle-di Container pattern; ctx.container set in context.
 */

import { describe, it, expect } from "bun:test";
import { TRPCError } from "@trpc/server";
import { Container } from "@needle-di/core";

import { appRouter } from "../../src/trpc/router.ts";
import { createContext } from "../../src/trpc/context.ts";
import { t } from "../../src/trpc/trpc.ts";
import { FlagRegistry } from "../../src/flags/registry.ts";

const createCaller = t.createCallerFactory(appRouter);

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build a mock session object that satisfies the TRPCContext shape
// ─────────────────────────────────────────────────────────────────────────────
function mockSession(overrides?: Partial<{ id: string; userId: string; orgId: string }>) {
  return {
    id: overrides?.id ?? "sess-test-001",
    userId: overrides?.userId ?? "user-test-001",
    orgId: overrides?.orgId ?? "00000000-0000-0000-0000-000000000001",
    activeOrganizationId: overrides?.orgId ?? "00000000-0000-0000-0000-000000000001",
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "tok-test-001",
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
  userId = "user-test-001",
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

function authenticatedCallerWithContainer(container: Container) {
  const userId = "user-test-001";
  const orgId = "00000000-0000-0000-0000-000000000001";
  const session = mockSession({ userId, orgId });
  return createCaller(
    createContext({
      session: session as unknown as import("better-auth").Session,
      orgId,
      userId,
      em: null,
      container,
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. UNAUTHORIZED — protected procedure without session
// ─────────────────────────────────────────────────────────────────────────────

describe("assertPermission middleware", () => {
  it("auth.whoami returns UNAUTHORIZED without session", async () => {
    const caller = unauthenticatedCaller();
    let error: TRPCError | null = null;
    try {
      await caller.auth.whoami();
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("UNAUTHORIZED");
  });

  it("tasks.list returns UNAUTHORIZED without session", async () => {
    const caller = unauthenticatedCaller();
    let error: TRPCError | null = null;
    try {
      await caller.tasks.list();
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("UNAUTHORIZED");
  });

  it("docs.list returns UNAUTHORIZED without session", async () => {
    const caller = unauthenticatedCaller();
    let error: TRPCError | null = null;
    try {
      await caller.docs.list();
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("UNAUTHORIZED");
  });

  it("returns INTERNAL_SERVER_ERROR when casbin flag check throws unexpectedly", async () => {
    const container = new Container();
    container.bind({
      provide: FlagRegistry,
      useValue: {
        isEnabled: async () => {
          throw new Error("flag store unavailable");
        },
      } as unknown as FlagRegistry,
    });
    const caller = authenticatedCallerWithContainer(container);
    let error: TRPCError | null = null;
    try {
      await caller.auth.whoami();
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("INTERNAL_SERVER_ERROR");
  });

  it("treats containers without FlagRegistry as casbin disabled", async () => {
    const caller = authenticatedCallerWithContainer(new Container());
    const result = await caller.auth.whoami();
    expect(result.userId).toBe("user-test-001");
    expect(result.orgId).toBe("00000000-0000-0000-0000-000000000001");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SUCCESS — protected procedure with session
// ─────────────────────────────────────────────────────────────────────────────

describe("authenticated calls", () => {
  it("auth.whoami returns userId + orgId for authenticated caller", async () => {
    const caller = authenticatedCaller();
    const result = await caller.auth.whoami();
    expect(result.userId).toBe("user-test-001");
    expect(result.orgId).toBe("00000000-0000-0000-0000-000000000001");
    expect(typeof result.sessionId).toBe("string");
  });

  it("tasks.list returns empty array for authenticated caller", async () => {
    const caller = authenticatedCaller();
    const result = await caller.tasks.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("docs.list returns empty array for authenticated caller", async () => {
    const caller = authenticatedCaller();
    const result = await caller.docs.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("memory.list returns empty array for authenticated caller", async () => {
    const caller = authenticatedCaller();
    const result = await caller.memory.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Public procedures — accessible without session
// ─────────────────────────────────────────────────────────────────────────────

describe("public procedures", () => {
  it("health.ping succeeds without session", async () => {
    const caller = unauthenticatedCaller();
    const result = await caller.health.ping();
    expect(result.ok).toBe(true);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it("db.ping succeeds without session", async () => {
    const caller = unauthenticatedCaller();
    const result = await caller.db.ping();
    expect(result.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Context population check
// ─────────────────────────────────────────────────────────────────────────────

describe("context population", () => {
  it("ctx.orgId is the well-known local org UUID for admin@local session", async () => {
    const LOCAL_ORG_UUID = "00000000-0000-0000-0000-000000000001";
    const caller = authenticatedCaller("admin-local-user", LOCAL_ORG_UUID);
    const result = await caller.auth.whoami();
    expect(result.orgId).toBe(LOCAL_ORG_UUID);
  });

  it("ctx.userId reflects the userId passed in context", async () => {
    const caller = authenticatedCaller("my-user-uuid");
    const result = await caller.auth.whoami();
    expect(result.userId).toBe("my-user-uuid");
  });
});
