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
 * Per C7: MikroORM v7 fork() + em.persist/flush pattern.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { TRPCError } from "@trpc/server";
import { MikroORM } from "@mikro-orm/postgresql";
import { PGlite } from "@electric-sql/pglite";
import { Container } from "@needle-di/core";

import { PGliteKyselyDialect } from "../../src/db/PGliteKyselyDriver.ts";
import { FeatureFlag } from "../../src/db/entities/auth/FeatureFlag.ts";
import { Org } from "../../src/db/entities/auth/Org.ts";
import { User } from "../../src/db/entities/auth/User.ts";
import { OrgMember } from "../../src/db/entities/auth/OrgMember.ts";
import { FeatureFlagRepository } from "../../src/db/repositories/auth/FeatureFlagRepository.ts";
import { OrgMemberRepository } from "../../src/db/repositories/auth/OrgMemberRepository.ts";
import { appRouter } from "../../src/trpc/router.ts";
import { createContext } from "../../src/trpc/context.ts";
import { t } from "../../src/trpc/trpc.ts";
import { FlagRegistry } from "../../src/flags/registry.ts";

const TEST_ORG_ID = "00000000-0000-0000-0000-000000000001";
const TEST_USER_ID = "00000000-0000-0000-0000-000000000010";
const TEST_ADMIN_USER_ID = "00000000-0000-0000-0000-000000000011";

let orm: MikroORM;
let flagRegistry: FlagRegistry;
let container: Container;

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
  const em = orm.em.fork();
  const flagRepo = em.getRepository(FeatureFlag) as FeatureFlagRepository;
  const orgMemberRepo = em.getRepository(OrgMember) as OrgMemberRepository;

  // Rebuild registry with fresh forked EM so it sees latest DB state
  const freshRegistry = new FlagRegistry(flagRepo);

  const ctx = createContext({
    session: session as unknown as import("better-auth").Session,
    orgId,
    userId,
    em: em as unknown as import("@mikro-orm/postgresql").EntityManager,
    container: (() => {
      const c = new Container();
      c.bind({ provide: FeatureFlagRepository, useValue: flagRepo });
      c.bind({ provide: OrgMemberRepository, useValue: orgMemberRepo });
      c.bind({ provide: FlagRegistry, useValue: freshRegistry });
      return c;
    })(),
  });

  return createCaller(ctx);
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
  const pglite = new PGlite();
  const dialect = new PGliteKyselyDialect(() => pglite);

  orm = await MikroORM.init({
    dbName: "postgres",
    driverOptions: dialect,
    entities: [FeatureFlag, Org, User, OrgMember],
    debug: false,
  });

  await orm.schema.create();

  // Seed with a forked EM
  const seedEm = orm.em.fork();

  const now = new Date();

  const org = seedEm.create(Org, {
    id: TEST_ORG_ID,
    name: "Test Org",
    slug: "test-org",
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

  seedEm.persist([org, owner, member, adminMembership, memberMembership]);
  await seedEm.flush();
});

afterAll(async () => {
  if (orm) await orm.close(true);
});

beforeEach(async () => {
  // Wipe feature flags between tests
  const em = orm.em.fork();
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
  it("returns all 16 flags with name, enabled, description fields", async () => {
    const caller = makeCaller(TEST_ADMIN_USER_ID, TEST_ORG_ID);
    const result = await caller.flags.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(16);
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
});
