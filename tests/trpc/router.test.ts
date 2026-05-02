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
import { z } from "zod";

import { appRouter } from "../../src/trpc/router.ts";
import { createContext } from "../../src/trpc/context.ts";
import { t } from "../../src/trpc/trpc.ts";
import { FlagRegistry } from "../../src/flags/registry.ts";
import { CasbinRuleRepository } from "../../src/db/repositories/flags/CasbinRuleRepository.ts";
import { protectedProcedure } from "../../src/trpc/middleware.ts";

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

  it("treats FlagRegistry lookup errors as casbin disabled", async () => {
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
    const result = await caller.auth.whoami();
    expect(result.userId).toBe("user-test-001");
    expect(result.orgId).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("fails closed when casbin is enabled but enforcement wiring throws", async () => {
    const container = new Container();
    container.bind({
      provide: FlagRegistry,
      useValue: {
        isEnabled: async () => true,
      } as unknown as FlagRegistry,
    });
    container.bind({
      provide: CasbinRuleRepository,
      useFactory: () => {
        throw new Error("casbin repo unavailable");
      },
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

  it("derives casbin resource/action from procedure path when input omits them", async () => {
    const rows = [{ ptype: "p", v0: "user-test-001", v1: "secure", v2: "read" }];

    const container = new Container();
    container.bind({
      provide: FlagRegistry,
      useValue: { isEnabled: async () => true } as unknown as FlagRegistry,
    });
    container.bind({
      provide: CasbinRuleRepository,
      useValue: {
        findAll: async () => rows,
      } as unknown as CasbinRuleRepository,
    });

    const router = t.router({
      secure: protectedProcedure.query(() => "ok"),
    });
    const caller = t.createCallerFactory(router)(
      createContext({
        session: mockSession({ userId: "user-test-001" }) as unknown as import("better-auth").Session,
        orgId: "00000000-0000-0000-0000-000000000001",
        userId: "user-test-001",
        em: null,
        container,
      }),
    );

    expect(await caller.secure()).toBe("ok");
  });

  it("ignores spoofed casbin resource/action input and enforces server route identity", async () => {
    const rows = [
      { ptype: "p", v0: "user-test-001", v1: "public", v2: "read" },
      { ptype: "p", v0: "user-test-001", v1: "secure", v2: "read" },
    ];
    const repo = {
      findAll: async () => rows,
    } as unknown as CasbinRuleRepository;

    const container = new Container();
    container.bind({
      provide: FlagRegistry,
      useValue: { isEnabled: async () => true } as unknown as FlagRegistry,
    });
    container.bind({ provide: CasbinRuleRepository, useValue: repo });

    const router = t.router({
      secure: protectedProcedure
        .input(z.object({ resource: z.string(), action: z.string() }))
        .mutation(() => "ok"),
    });
    const caller = t.createCallerFactory(router)(
      createContext({
        session: mockSession({ userId: "user-test-001" }) as unknown as import("better-auth").Session,
        orgId: "00000000-0000-0000-0000-000000000001",
        userId: "user-test-001",
        em: null,
        container,
      }),
    );

    let error: TRPCError | null = null;
    try {
      await caller.secure({ resource: "public", action: "read" });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }

    expect(error).not.toBeNull();
    expect(error?.code).toBe("FORBIDDEN");
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
