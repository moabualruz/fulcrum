/**
 * tRPC flags procedure tests — TDD RED → GREEN.
 *
 * Acceptance criteria (issue #07):
 *   1. flags.list() returns all 16 flags with { name, enabled, description }.
 *   2. flags.list() returns enabled=false for all flags on fresh install.
 *   3. flags.set('router-llm', true) upserts a FeatureFlag row and returns { ok: true }.
 *   4. After flags.set, flags.list() reflects enabled=true for that flag.
 *   5. Non-owner/admin calling flags.set → FORBIDDEN (owner check).
 *   6. Unauthenticated caller on flags.list → UNAUTHORIZED.
 *
 * Per C6: NO raw SQL strings.
 * Per C7: TypeORM EntityManager via createTestOrm() with compat shims.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { TRPCError } from "@trpc/server";

import { createTestOrm, destroyTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { FeatureFlag } from "@identity-access/infrastructure/database/entities/auth/FeatureFlag.ts";
import { FEATURE_FLAGS } from "@platform-core/application/feature-flags/registry.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { User } from "@identity-access/infrastructure/database/entities/auth/User.ts";
import { OrgMember } from "@identity-access/infrastructure/database/entities/auth/OrgMember.ts";
import { FeatureFlagRollout } from "@platform-core/infrastructure/application-database/entities/platform/FeatureFlagRollout.ts";
import { FeatureFlagRepository } from "@identity-access/infrastructure/database/repositories/auth/FeatureFlagRepository.ts";
import { OrgMemberRepository } from "@identity-access/infrastructure/database/repositories/auth/OrgMemberRepository.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import { FlagRegistry } from "@platform-core/application/feature-flags/registry.ts";
import type { DiContainer } from "@platform-core/application/runtime/di-container.ts";

function createMapContainer(): DiContainer {
  const bindings = new Map<unknown, unknown>();
  return {
    get: (token: unknown) => {
      if (bindings.has(token)) return bindings.get(token) as never;
      throw new Error(`Token not found: ${String(token)}`);
    },
    has: (token: unknown) => bindings.has(token),
    bind: (binding: unknown) => {
      const b = binding as { provide?: unknown; useValue?: unknown };
      if (b?.provide !== undefined) bindings.set(b.provide, b.useValue);
    },
  };
}

const TEST_ORG_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG_ID = "11111111-1111-4111-8111-111111111111";
const TEST_USER_ID = "00000000-0000-4000-8000-000000000010";
const TEST_ADMIN_USER_ID = "00000000-0000-4000-8000-000000000011";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000020";

let testOrm: TestOrm;

const createCaller = t.createCallerFactory(appRouter);

function mockSession(userId: string, orgId: string) {
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
  };
}

function makeCaller(userId: string, orgId: string) {
  const session = mockSession(userId, orgId);
  const em = testOrm.em;
  const flagRepo = em.getRepository(FeatureFlag) as unknown as FeatureFlagRepository;
  const orgMemberRepo = em.getRepository(OrgMember) as unknown as OrgMemberRepository;

  // Rebuild registry with fresh forked EM so it sees latest DB state
  const freshRegistry = new FlagRegistry(flagRepo);

  const ctx = createContext({
    session: session as unknown as import("better-auth").Session,
    orgId,
    userId,
    em,
    container: (() => {
      const c = createMapContainer();
      c.bind({ provide: FeatureFlagRepository, useValue: flagRepo });
      c.bind({ provide: OrgMemberRepository, useValue: orgMemberRepo });
      c.bind({ provide: FlagRegistry, useValue: freshRegistry });
      return c;
    })(),
  });

  return createCaller(ctx);
}

function makeCallerWithoutContainer(userId: string, orgId: string) {
  const session = mockSession(userId, orgId);
  const em = testOrm.em;

  return createCaller(
    createContext({
      session: session as unknown as import("better-auth").Session,
      orgId,
      userId,
      em,
      container: null,
    }),
  );
}

function unauthCaller() {
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

beforeAll(async () => {
  testOrm = await createTestOrm();

  const seedEm = testOrm.em;
  const now = new Date();

  const org = seedEm.create(Org, {
    id: TEST_ORG_ID,
    name: "Test Org",
    slug: "test-org",
    createdAt: now,
    updatedAt: now,
  });

  const otherOrg = seedEm.create(Org, {
    id: OTHER_ORG_ID,
    name: "Other Org",
    slug: "other-org",
    createdAt: now,
    updatedAt: now,
  });

  const owner = seedEm.create(User, {
    id: TEST_ADMIN_USER_ID,
    email: "admin@test.local",
    name: "Admin",
    orgId: TEST_ORG_ID,
    role: "owner",
    createdAt: now,
    updatedAt: now,
  });

  const member = seedEm.create(User, {
    id: TEST_USER_ID,
    email: "member@test.local",
    name: "Member",
    orgId: TEST_ORG_ID,
    role: "member",
    createdAt: now,
    updatedAt: now,
  });

  const otherMember = seedEm.create(User, {
    id: OTHER_USER_ID,
    email: "other-member@test.local",
    name: "Other Member",
    orgId: OTHER_ORG_ID,
    role: "member",
    createdAt: now,
    updatedAt: now,
  });

  const adminMembership = seedEm.create(OrgMember, {
    userId: TEST_ADMIN_USER_ID,
    orgId: TEST_ORG_ID,
    role: "owner",
    joinedAt: now,
  });

  const memberMembership = seedEm.create(OrgMember, {
    userId: TEST_USER_ID,
    orgId: TEST_ORG_ID,
    role: "member",
    joinedAt: now,
  });

  const otherMembership = seedEm.create(OrgMember, {
    userId: OTHER_USER_ID,
    orgId: OTHER_ORG_ID,
    role: "member",
    joinedAt: now,
  });

  seedEm.persist([
    org,
    otherOrg,
    owner,
    member,
    otherMember,
    adminMembership,
    memberMembership,
    otherMembership,
  ]);
  await seedEm.flush();
});

afterAll(async () => {
  await destroyTestOrm();
});

beforeEach(async () => {
  // Wipe feature flags between tests
  const em = testOrm.em;
  await em.nativeDelete(FeatureFlagRollout, {});
  await em.nativeDelete(FeatureFlag, {});
  delete process.env["FULCRUM_FEATURES"];
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. flags.list() — unauthenticated
// ─────────────────────────────────────────────────────────────────────────────

describe("flags.list — unauthenticated", () => {
  it("returns UNAUTHORIZED without session", async () => {
    const caller = unauthCaller();
    let error: TRPCError | null = null;
    try {
      await caller.flags.list();
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("UNAUTHORIZED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. flags.list() — authenticated
// ─────────────────────────────────────────────────────────────────────────────

describe("flags.list — authenticated", () => {
  it("returns all registered flags with name, enabled, description fields", async () => {
    const caller = makeCaller(TEST_ADMIN_USER_ID, TEST_ORG_ID);
    const result = await caller.flags.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(FEATURE_FLAGS.length);
    for (const item of result) {
      expect(typeof item.name).toBe("string");
      expect(typeof item.enabled).toBe("boolean");
      expect(typeof item.description).toBe("string");
    }
  });

  it("all flags enabled=false on fresh install (no DB rows, no env var)", async () => {
    const caller = makeCaller(TEST_ADMIN_USER_ID, TEST_ORG_ID);
    const result = await caller.flags.list();
    for (const item of result) {
      expect(item.enabled).toBe(false);
    }
  });

  it("router-llm shows enabled=true when in FULCRUM_FEATURES env var", async () => {
    process.env["FULCRUM_FEATURES"] = "router-llm";

    const caller = makeCaller(TEST_ADMIN_USER_ID, TEST_ORG_ID);
    const result = await caller.flags.list();
    const routerLlm = result.find((f) => f.name === "router-llm");
    expect(routerLlm).toBeDefined();
    expect(routerLlm!.enabled).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. flags.set() — owner can set
// ─────────────────────────────────────────────────────────────────────────────

describe("flags.set — owner/admin", () => {
  it("owner can set a flag to true — returns { ok: true }", async () => {
    const caller = makeCaller(TEST_ADMIN_USER_ID, TEST_ORG_ID);
    const result = await caller.flags.set({ flag: "router-llm", enabled: true });
    expect(result.ok).toBe(true);

    const em = testOrm.em;
    const orgFlag = await em.findOne(FeatureFlag, { where: {
      orgId: TEST_ORG_ID,
      userId: null,
      flag: "router-llm",
    } });
    const globalFlag = await em.findOne(FeatureFlag, { where: {
      orgId: null,
      userId: null,
      flag: "router-llm",
    } });
    expect(orgFlag?.enabled).toBe(true);
    expect(globalFlag).toBeNull();
  });

  it("after flags.set(router-llm, true), flags.list returns enabled=true", async () => {
    const setCaller = makeCaller(TEST_ADMIN_USER_ID, TEST_ORG_ID);
    await setCaller.flags.set({ flag: "router-llm", enabled: true });

    // Fresh caller with new forked EM + new registry (no cache)
    const listCaller = makeCaller(TEST_ADMIN_USER_ID, TEST_ORG_ID);
    const result = await listCaller.flags.list();
    const routerLlm = result.find((f) => f.name === "router-llm");
    expect(routerLlm!.enabled).toBe(true);
  });

  it("flags.set upserts: calling twice with different values uses latest", async () => {
    const caller1 = makeCaller(TEST_ADMIN_USER_ID, TEST_ORG_ID);
    await caller1.flags.set({ flag: "embeddings", enabled: true });

    const caller2 = makeCaller(TEST_ADMIN_USER_ID, TEST_ORG_ID);
    await caller2.flags.set({ flag: "embeddings", enabled: false });

    const caller3 = makeCaller(TEST_ADMIN_USER_ID, TEST_ORG_ID);
    const result = await caller3.flags.list();
    const embeddings = result.find((f) => f.name === "embeddings");
    expect(embeddings!.enabled).toBe(false);
  });

  it("owner cannot set a flag for another org", async () => {
    const caller = makeCaller(TEST_ADMIN_USER_ID, TEST_ORG_ID);
    let error: TRPCError | null = null;

    try {
      await caller.flags.set({
        flag: "router-llm",
        enabled: true,
        orgId: OTHER_ORG_ID,
      });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }

    expect(error).not.toBeNull();
    expect(error?.code).toBe("FORBIDDEN");

    const em = testOrm.em;
    const foreignFlag = await em.findOne(FeatureFlag, { where: {
      orgId: OTHER_ORG_ID,
      userId: null,
      flag: "router-llm",
    } });
    expect(foreignFlag).toBeNull();
  });

  it("owner cannot set a user-scoped flag for a user outside the caller org", async () => {
    const caller = makeCaller(TEST_ADMIN_USER_ID, TEST_ORG_ID);
    let error: TRPCError | null = null;

    try {
      await caller.flags.set({
        flag: "embeddings",
        enabled: true,
        userId: OTHER_USER_ID,
      });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }

    expect(error).not.toBeNull();
    expect(error?.code).toBe("FORBIDDEN");

    const em = testOrm.em;
    const foreignUserFlag = await em.findOne(FeatureFlag, { where: {
      orgId: TEST_ORG_ID,
      userId: OTHER_USER_ID,
      flag: "embeddings",
    } });
    expect(foreignUserFlag).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. flags.set() — non-owner is FORBIDDEN
// ─────────────────────────────────────────────────────────────────────────────

describe("flags.set — non-owner forbidden", () => {
  it("member (non-owner) calling flags.set gets FORBIDDEN", async () => {
    const caller = makeCaller(TEST_USER_ID, TEST_ORG_ID);
    let error: TRPCError | null = null;
    try {
      await caller.flags.set({ flag: "router-llm", enabled: true });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("member with em but no container still gets FORBIDDEN", async () => {
    const caller = makeCallerWithoutContainer(TEST_USER_ID, TEST_ORG_ID);
    let error: TRPCError | null = null;
    try {
      await caller.flags.set({ flag: "router-llm", enabled: true });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("FORBIDDEN");
  });
});

describe("flags rollout procedures", () => {
  it("owner sets rollout percentage and evaluates users deterministically", async () => {
    const caller = makeCaller(TEST_ADMIN_USER_ID, TEST_ORG_ID);
    await caller.flags.set({ flag: "router-llm", enabled: true });
    expect(await caller.flags.setRollout({ flag: "router-llm", rolloutPercent: 0 })).toEqual({
      ok: true,
    });

    expect(
      await caller.flags.evaluate({
        flag: "router-llm",
        orgId: TEST_ORG_ID,
        userId: TEST_USER_ID,
      }),
    ).toEqual({ enabled: false });

    expect(await caller.flags.setRollout({ flag: "router-llm", rolloutPercent: 100 })).toEqual({
      ok: true,
    });

    expect(
      await caller.flags.evaluate({
        flag: "router-llm",
        orgId: TEST_ORG_ID,
        userId: TEST_USER_ID,
      }),
    ).toEqual({ enabled: true });
  });

  it("per-org override enable and disable wins over rollout", async () => {
    const caller = makeCaller(TEST_ADMIN_USER_ID, TEST_ORG_ID);
    await caller.flags.set({ flag: "embeddings", enabled: true });
    await caller.flags.setRollout({ flag: "embeddings", rolloutPercent: 0 });

    expect(
      await caller.flags.setOverride({
        flag: "embeddings",
        orgId: TEST_ORG_ID,
        enabled: true,
      }),
    ).toEqual({ ok: true });
    expect(
      await caller.flags.evaluate({
        flag: "embeddings",
        orgId: TEST_ORG_ID,
        userId: TEST_USER_ID,
      }),
    ).toEqual({ enabled: true });

    await caller.flags.setRollout({ flag: "embeddings", rolloutPercent: 100 });
    await caller.flags.setOverride({
      flag: "embeddings",
      orgId: TEST_ORG_ID,
      enabled: false,
    });

    expect(
      await caller.flags.evaluate({
        flag: "embeddings",
        orgId: TEST_ORG_ID,
        userId: TEST_USER_ID,
      }),
    ).toEqual({ enabled: false });
  });

  it("rejects rollout percentages outside 0-100", async () => {
    const caller = makeCaller(TEST_ADMIN_USER_ID, TEST_ORG_ID);
    await expect(
      caller.flags.setRollout({ flag: "router-llm", rolloutPercent: 101 }),
    ).rejects.toThrow();
  });
});
