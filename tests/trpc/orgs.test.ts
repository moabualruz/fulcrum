/**
 * tRPC orgs procedure tests — TDD RED → GREEN.
 *
 * Acceptance criteria (issue #09):
 *   1. orgs.get() returns current org for authenticated caller.
 *   2. orgs.update(name) changes org name (owner only).
 *   3. orgs.update by non-owner → FORBIDDEN.
 *   4. orgs.members.list() returns all members (admin/owner only).
 *   5. orgs.members.list() by guest → FORBIDDEN.
 *   6. orgs.members.updateRole(userId, role) updates role (owner only).
 *   7. orgs.members.remove(userId) removes a member (owner/admin only).
 *   8. orgs.members.remove last owner → BAD_REQUEST.
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
import { Org } from "../../src/db/entities/auth/Org.ts";
import { User } from "../../src/db/entities/auth/User.ts";
import { OrgMember } from "../../src/db/entities/auth/OrgMember.ts";
import { OrgMemberRepository } from "../../src/db/repositories/auth/OrgMemberRepository.ts";
import { FlagRegistry } from "../../src/flags/registry.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

// Use valid v4 UUIDs so Zod input validation passes when these are used as procedure inputs
const TEST_ORG_ID = "00000000-0000-0000-0000-000000000001"; // nil-adjacent — only used as DB seed, not input
const TEST_OWNER_ID = "46c4857c-7293-4e1d-a85b-51953a20b198";
const TEST_ADMIN_ID = "397016b4-5cb3-4f33-a40d-03643aac7962";
const TEST_MEMBER_ID = "b0f9ea3a-9694-4133-b5cc-7cc5db5204ce";
const TEST_GUEST_ID = "9f9e0546-991b-44f5-a206-d1e3ead1db19";
// Extra member for remove-last-owner test (second owner)
const TEST_OWNER2_ID = "5249114a-448a-4a87-b27c-777348132275";

let orm: MikroORM;

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

function makeCaller(userId: string, orgId: string = TEST_ORG_ID) {
  const session = mockSession(userId, orgId);
  const em = orm.em.fork();
  const orgMemberRepo = em.getRepository(OrgMember) as OrgMemberRepository;

  const ctx = createContext({
    session: session as unknown as import("better-auth").Session,
    orgId,
    userId,
    em: em as unknown as import("@mikro-orm/postgresql").EntityManager,
    container: (() => {
      const c = new Container();
      c.bind({ provide: OrgMemberRepository, useValue: orgMemberRepo });
      c.bind({
        provide: FlagRegistry,
        useValue: {
          isEnabled: async () => false,
        } as unknown as FlagRegistry,
      });
      return c;
    })(),
  });

  return createCaller(ctx);
}

beforeAll(async () => {
  const pglite = new PGlite();
  const dialect = new PGliteKyselyDialect(() => pglite);

  orm = await MikroORM.init({
    dbName: "postgres",
    driverOptions: dialect,
    entities: [Org, User, OrgMember],
    debug: false,
  });

  await orm.schema.create();

  const seedEm = orm.em.fork();
  const now = new Date();

  const org = seedEm.create(Org, {
    id: TEST_ORG_ID,
    name: "Orgs Test Org",
    slug: "orgs-test-org",
    createdAt: now,
    updatedAt: now,
  });

  const users: Array<{ id: string; email: string; role: string }> = [
    { id: TEST_OWNER_ID, email: "owner@orgs.test", role: "owner" },
    { id: TEST_OWNER2_ID, email: "owner2@orgs.test", role: "owner" },
    { id: TEST_ADMIN_ID, email: "admin@orgs.test", role: "admin" },
    { id: TEST_MEMBER_ID, email: "member@orgs.test", role: "member" },
    { id: TEST_GUEST_ID, email: "guest@orgs.test", role: "guest" },
  ];

  const userEntities = users.map((u) =>
    seedEm.create(User, {
      id: u.id,
      email: u.email,
      name: u.role,
      orgId: TEST_ORG_ID,
      role: u.role as "owner" | "admin" | "member" | "guest",
      createdAt: now,
      updatedAt: now,
    }),
  );

  const memberships = users.map((u) =>
    seedEm.create(OrgMember, {
      userId: u.id,
      orgId: TEST_ORG_ID,
      role: u.role,
      joinedAt: now,
    }),
  );

  seedEm.persist([org, ...userEntities, ...memberships]);
  await seedEm.flush();
});

afterAll(async () => {
  if (orm) await orm.close(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. orgs.get
// ─────────────────────────────────────────────────────────────────────────────

describe("orgs.get", () => {
  it("returns current org for authenticated owner", async () => {
    const caller = makeCaller(TEST_OWNER_ID);
    const result = await caller.orgs.get();
    expect(result.id).toBe(TEST_ORG_ID);
    expect(result.name).toBe("Orgs Test Org");
    expect(result.slug).toBe("orgs-test-org");
  });

  it("returns current org for authenticated member", async () => {
    const caller = makeCaller(TEST_MEMBER_ID);
    const result = await caller.orgs.get();
    expect(result.id).toBe(TEST_ORG_ID);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. orgs.update
// ─────────────────────────────────────────────────────────────────────────────

describe("orgs.update", () => {
  it("owner can update org name", async () => {
    const caller = makeCaller(TEST_OWNER_ID);
    const result = await caller.orgs.update({ name: "Updated Org Name" });
    expect(result.ok).toBe(true);

    // Verify change
    const verifyCaller = makeCaller(TEST_OWNER_ID);
    const org = await verifyCaller.orgs.get();
    expect(org.name).toBe("Updated Org Name");

    // Restore
    await caller.orgs.update({ name: "Orgs Test Org" });
  });

  it("admin calling update → FORBIDDEN", async () => {
    const caller = makeCaller(TEST_ADMIN_ID);
    let error: TRPCError | null = null;
    try {
      await caller.orgs.update({ name: "Should Fail" });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("member calling update → FORBIDDEN", async () => {
    const caller = makeCaller(TEST_MEMBER_ID);
    let error: TRPCError | null = null;
    try {
      await caller.orgs.update({ name: "Should Fail" });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("FORBIDDEN");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. orgs.members.list
// ─────────────────────────────────────────────────────────────────────────────

describe("orgs.members.list", () => {
  it("owner can list members", async () => {
    const caller = makeCaller(TEST_OWNER_ID);
    const members = await caller.orgs.members.list();
    expect(Array.isArray(members)).toBe(true);
    expect(members.length).toBeGreaterThanOrEqual(5);
    for (const m of members) {
      expect(typeof m.userId).toBe("string");
      expect(typeof m.role).toBe("string");
    }
  });

  it("admin can list members", async () => {
    const caller = makeCaller(TEST_ADMIN_ID);
    const members = await caller.orgs.members.list();
    expect(Array.isArray(members)).toBe(true);
    expect(members.length).toBeGreaterThanOrEqual(5);
  });

  it("member (non-admin) calling members.list → FORBIDDEN", async () => {
    const caller = makeCaller(TEST_MEMBER_ID);
    let error: TRPCError | null = null;
    try {
      await caller.orgs.members.list();
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("guest calling members.list → FORBIDDEN", async () => {
    const caller = makeCaller(TEST_GUEST_ID);
    let error: TRPCError | null = null;
    try {
      await caller.orgs.members.list();
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("FORBIDDEN");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. orgs.members.updateRole
// ─────────────────────────────────────────────────────────────────────────────

describe("orgs.members.updateRole", () => {
  it("owner can change a member's role", async () => {
    const caller = makeCaller(TEST_OWNER_ID);
    const result = await caller.orgs.members.updateRole({
      userId: TEST_GUEST_ID,
      role: "member",
    });
    expect(result.ok).toBe(true);

    // Verify via DB
    const em = orm.em.fork();
    const membership = await em.findOne(OrgMember, {
      orgId: TEST_ORG_ID,
      userId: TEST_GUEST_ID,
    });
    expect((membership as { role: string }).role).toBe("member");

    // Restore
    await caller.orgs.members.updateRole({ userId: TEST_GUEST_ID, role: "guest" });
  });

  it("admin calling updateRole → FORBIDDEN", async () => {
    const caller = makeCaller(TEST_ADMIN_ID);
    let error: TRPCError | null = null;
    try {
      await caller.orgs.members.updateRole({ userId: TEST_MEMBER_ID, role: "admin" });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("FORBIDDEN");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. orgs.members.remove
// ─────────────────────────────────────────────────────────────────────────────

describe("orgs.members.remove", () => {
  it("owner can remove a member", async () => {
    // Add a temporary member to remove
    const addEm = orm.em.fork();
    const tempUserId = "6e599624-560d-4858-b967-f1c2b015790f";
    const tempUser = addEm.create(User, {
      id: tempUserId,
      email: "temp@orgs.test",
      orgId: TEST_ORG_ID,
      role: "member",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const tempMember = addEm.create(OrgMember, {
      userId: tempUserId,
      orgId: TEST_ORG_ID,
      role: "member",
      joinedAt: new Date(),
    });
    addEm.persist([tempUser, tempMember]);
    await addEm.flush();

    const caller = makeCaller(TEST_OWNER_ID);
    const result = await caller.orgs.members.remove({ userId: tempUserId });
    expect(result.ok).toBe(true);

    // Verify removed
    const verifyEm = orm.em.fork();
    const membership = await verifyEm.findOne(OrgMember, {
      orgId: TEST_ORG_ID,
      userId: tempUserId,
    });
    expect(membership).toBeNull();
  });

  it("admin can remove a member", async () => {
    // Add a temporary guest to remove
    const addEm = orm.em.fork();
    const tempUserId = "6dfb8d86-5348-4c26-98ac-a1d05b9b8c17";
    const tempUser = addEm.create(User, {
      id: tempUserId,
      email: "temp2@orgs.test",
      orgId: TEST_ORG_ID,
      role: "guest",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const tempMember = addEm.create(OrgMember, {
      userId: tempUserId,
      orgId: TEST_ORG_ID,
      role: "guest",
      joinedAt: new Date(),
    });
    addEm.persist([tempUser, tempMember]);
    await addEm.flush();

    const caller = makeCaller(TEST_ADMIN_ID);
    const result = await caller.orgs.members.remove({ userId: tempUserId });
    expect(result.ok).toBe(true);
  });

  it("member calling remove → FORBIDDEN", async () => {
    const caller = makeCaller(TEST_MEMBER_ID);
    let error: TRPCError | null = null;
    try {
      await caller.orgs.members.remove({ userId: TEST_GUEST_ID });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("cannot remove last owner → BAD_REQUEST", async () => {
    // Remove the second owner first so we're down to one
    const caller = makeCaller(TEST_OWNER_ID);
    // First remove owner2 to test we can (not last owner yet)
    // But that would leave 1 owner — instead test removing TEST_OWNER_ID directly while
    // TEST_OWNER2_ID is still there (should succeed), but we can't restore easily.
    // Instead: test removing TEST_OWNER_ID when TEST_OWNER2_ID is the only other owner
    // would succeed. So let's test the single-owner case by first removing TEST_OWNER2_ID.

    // Remove owner2 (valid — 2 owners still exist at start: TEST_OWNER_ID + TEST_OWNER2_ID)
    const remove2Result = await caller.orgs.members.remove({ userId: TEST_OWNER2_ID });
    expect(remove2Result.ok).toBe(true);

    // Now try to remove TEST_OWNER_ID — should fail (last owner)
    let error: TRPCError | null = null;
    try {
      await caller.orgs.members.remove({ userId: TEST_OWNER_ID });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("BAD_REQUEST");

    // Restore owner2
    const restoreEm = orm.em.fork();
    const restoredMember = restoreEm.create(OrgMember, {
      userId: TEST_OWNER2_ID,
      orgId: TEST_ORG_ID,
      role: "owner",
      joinedAt: new Date(),
    });
    restoreEm.persist(restoredMember);
    await restoreEm.flush();
  });
});
