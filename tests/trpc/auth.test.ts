/**
 * tRPC auth procedure tests — TDD RED → GREEN.
 *
 * Acceptance criteria (issue #09):
 *   1. auth.whoami returns { userId, orgId, email, role } with correct values.
 *   2. auth.invite creates an Invitation row (verified via invitationRepo.findOne).
 *   3. auth.acceptInvite with valid token creates OrgMember row + returns { userId, orgId }.
 *   4. auth.acceptInvite with expired token → BAD_REQUEST.
 *   5. auth.acceptInvite with already-accepted token → BAD_REQUEST.
 *   6. auth.invite by non-admin → FORBIDDEN.
 *   7. auth.whoami without session → UNAUTHORIZED.
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
import { Invitation } from "../../src/db/entities/auth/Invitation.ts";
import { OrgMemberRepository } from "../../src/db/repositories/auth/OrgMemberRepository.ts";
import { InvitationRepository } from "../../src/db/repositories/auth/InvitationRepository.ts";
import { FlagRegistry } from "../../src/flags/registry.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const TEST_ORG_ID = "00000000-0000-0000-0000-000000000001"; // nil-adjacent — DB seed only
const TEST_OWNER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const TEST_ADMIN_ID = "c3d4e5f6-a7b8-4c9d-90e1-f2a3b4c5d6e7";
const TEST_MEMBER_ID = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";

let orm: MikroORM;
let pglite: PGlite;

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
  const orgMemberRepo = em.getRepository(OrgMember) as OrgMemberRepository;
  const invitationRepo = em.getRepository(Invitation) as InvitationRepository;

  const ctx = createContext({
    session: session as unknown as import("better-auth").Session,
    orgId,
    userId,
    em: em as unknown as import("@mikro-orm/postgresql").EntityManager,
    container: (() => {
      const c = new Container();
      c.bind({ provide: OrgMemberRepository, useValue: orgMemberRepo });
      c.bind({ provide: InvitationRepository, useValue: invitationRepo });
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

function makeCallerWithoutContainer(userId: string, orgId: string) {
  const session = mockSession(userId, orgId);
  const em = orm.em.fork();

  return createCaller(
    createContext({
      session: session as unknown as import("better-auth").Session,
      orgId,
      userId,
      em: em as unknown as import("@mikro-orm/postgresql").EntityManager,
      container: null,
    }),
  );
}

function makeCallerWithoutPersistence(userId: string, orgId: string) {
  const session = mockSession(userId, orgId);

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
  pglite = new PGlite();
  const dialect = new PGliteKyselyDialect(() => pglite);

  orm = await MikroORM.init({
    dbName: "postgres",
    driverOptions: dialect,
    entities: [Org, User, OrgMember, Invitation],
    debug: false,
  });

  await orm.schema.create();

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
    id: TEST_OWNER_ID,
    email: "owner@test.local",
    name: "Owner",
    orgId: TEST_ORG_ID,
    role: "owner",
    createdAt: now,
    updatedAt: now,
  });

  const member = seedEm.create(User, {
    id: TEST_MEMBER_ID,
    email: "member@test.local",
    name: "Member",
    orgId: TEST_ORG_ID,
    role: "member",
    createdAt: now,
    updatedAt: now,
  });

  const admin = seedEm.create(User, {
    id: TEST_ADMIN_ID,
    email: "admin@test.local",
    name: "Admin",
    orgId: TEST_ORG_ID,
    role: "admin",
    createdAt: now,
    updatedAt: now,
  });

  const ownerMembership = seedEm.create(OrgMember, {
    userId: TEST_OWNER_ID,
    orgId: TEST_ORG_ID,
    role: "owner",
    joinedAt: now,
  });

  const memberMembership = seedEm.create(OrgMember, {
    userId: TEST_MEMBER_ID,
    orgId: TEST_ORG_ID,
    role: "member",
    joinedAt: now,
  });

  const adminMembership = seedEm.create(OrgMember, {
    userId: TEST_ADMIN_ID,
    orgId: TEST_ORG_ID,
    role: "admin",
    joinedAt: now,
  });

  seedEm.persist([org, owner, admin, member, ownerMembership, adminMembership, memberMembership]);
  await seedEm.flush();
});

afterAll(async () => {
  if (orm) await orm.close(true);
  if (pglite) await pglite.close();
});

beforeEach(async () => {
  // Wipe invitations between tests
  const em = orm.em.fork();
  await em.nativeDelete(Invitation, {});
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. auth.whoami
// ─────────────────────────────────────────────────────────────────────────────

describe("auth.whoami", () => {
  it("returns userId, orgId, email, role for authenticated caller", async () => {
    const caller = makeCaller(TEST_OWNER_ID, TEST_ORG_ID);
    const result = await caller.auth.whoami();
    expect(result.userId).toBe(TEST_OWNER_ID);
    expect(result.orgId).toBe(TEST_ORG_ID);
    expect(result.email).toBe("owner@test.local");
    expect(result.role).toBe("owner");
  });

  it("returns UNAUTHORIZED without session", async () => {
    const caller = unauthCaller();
    let error: TRPCError | null = null;
    try {
      await caller.auth.whoami();
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("UNAUTHORIZED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. auth.invite
// ─────────────────────────────────────────────────────────────────────────────

describe("auth.invite", () => {
  it("owner can create invitation — returns invitationId + token", async () => {
    const caller = makeCaller(TEST_OWNER_ID, TEST_ORG_ID);
    const result = await caller.auth.invite({ email: "new@test.local", role: "member" });
    expect(typeof result.invitationId).toBe("string");
    expect(typeof result.token).toBe("string");
    expect(result.token.length).toBeGreaterThan(0);
  });

  it("owner can invite admins", async () => {
    const caller = makeCaller(TEST_OWNER_ID, TEST_ORG_ID);
    const result = await caller.auth.invite({ email: "admin-invite@test.local", role: "admin" });
    expect(typeof result.invitationId).toBe("string");
  });

  it("admin can invite guests", async () => {
    const caller = makeCaller(TEST_ADMIN_ID, TEST_ORG_ID);
    const result = await caller.auth.invite({ email: "guest-invite@test.local", role: "guest" });
    expect(typeof result.invitationId).toBe("string");
  });

  it("admin inviting owner → FORBIDDEN", async () => {
    const caller = makeCaller(TEST_ADMIN_ID, TEST_ORG_ID);
    let error: TRPCError | null = null;
    try {
      await caller.auth.invite({ email: "owner-invite@test.local", role: "owner" });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("admin inviting admin → FORBIDDEN", async () => {
    const caller = makeCaller(TEST_ADMIN_ID, TEST_ORG_ID);
    let error: TRPCError | null = null;
    try {
      await caller.auth.invite({ email: "admin-peer-invite@test.local", role: "admin" });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("invite creates an Invitation row in DB", async () => {
    const caller = makeCaller(TEST_OWNER_ID, TEST_ORG_ID);
    const result = await caller.auth.invite({ email: "check@test.local", role: "member" });

    // Verify via fresh EM
    const em = orm.em.fork();
    const inv = await em.findOne(Invitation, { id: result.invitationId });
    expect(inv).not.toBeNull();
    expect((inv as { email: string }).email).toBe("check@test.local");
    expect((inv as { orgId: string }).orgId).toBe(TEST_ORG_ID);
    expect((inv as { role: string }).role).toBe("member");
    // Token is stored hashed — plaintext !== stored value
    expect((inv as { token: string }).token).not.toBe(result.token);
  });

  it("member (non-admin) calling invite → FORBIDDEN", async () => {
    const caller = makeCaller(TEST_MEMBER_ID, TEST_ORG_ID);
    let error: TRPCError | null = null;
    try {
      await caller.auth.invite({ email: "fail@test.local", role: "member" });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("member with em but no container still gets FORBIDDEN", async () => {
    const caller = makeCallerWithoutContainer(TEST_MEMBER_ID, TEST_ORG_ID);
    let error: TRPCError | null = null;
    try {
      await caller.auth.invite({ email: "fail-no-container@test.local", role: "owner" });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("fails closed when no membership repository or EntityManager is available", async () => {
    const caller = makeCallerWithoutPersistence(TEST_OWNER_ID, TEST_ORG_ID);
    let error: TRPCError | null = null;
    try {
      await caller.auth.invite({ email: "fail-no-persistence@test.local", role: "member" });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("INTERNAL_SERVER_ERROR");
    expect(error?.message).toBe("OrgMember repository could not be resolved.");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. auth.acceptInvite
// ─────────────────────────────────────────────────────────────────────────────

describe("auth.acceptInvite", () => {
  it("valid token creates OrgMember row and returns { userId, orgId }", async () => {
    // Create invitation as owner
    const inviteCaller = makeCaller(TEST_OWNER_ID, TEST_ORG_ID);
    const { token, invitationId } = await inviteCaller.auth.invite({
      email: "accept@test.local",
      role: "member",
    });

    // Accept as unauthenticated caller (publicProcedure)
    const acceptEm = orm.em.fork();
    const acceptCaller = createCaller(
      createContext({
        session: null,
        orgId: null,
        userId: null,
        em: acceptEm as unknown as import("@mikro-orm/postgresql").EntityManager,
        container: null,
      }),
    );

    const result = await acceptCaller.auth.acceptInvite({ token });
    expect(typeof result.userId).toBe("string");
    expect(result.orgId).toBe(TEST_ORG_ID);

    // Verify OrgMember row created
    const verifyEm = orm.em.fork();
    const member = await verifyEm.findOne(OrgMember, {
      orgId: TEST_ORG_ID,
      userId: result.userId,
    });
    expect(member).not.toBeNull();
    expect((member as { role: string }).role).toBe("member");

    // Verify invitation marked accepted
    const inv = await verifyEm.findOne(Invitation, { id: invitationId });
    expect((inv as { acceptedAt: Date | undefined }).acceptedAt).not.toBeUndefined();
  });

  it("expired token → BAD_REQUEST", async () => {
    // Manually insert an expired invitation
    const em = orm.em.fork();
    const pastDate = new Date(Date.now() - 1000); // 1 second ago
    const plainToken = "expired-plain-token-12345678901234567890";
    const { createHash } = await import("node:crypto");
    const tokenHash = createHash("sha256").update(plainToken).digest("hex");

    const inv = em.create(Invitation, {
      orgId: TEST_ORG_ID,
      email: "expired@test.local",
      role: "member",
      token: tokenHash,
      expiresAt: pastDate,
      createdAt: new Date(),
    });
    em.persist(inv);
    await em.flush();

    const acceptEm = orm.em.fork();
    const caller = createCaller(
      createContext({
        session: null,
        orgId: null,
        userId: null,
        em: acceptEm as unknown as import("@mikro-orm/postgresql").EntityManager,
        container: null,
      }),
    );

    let error: TRPCError | null = null;
    try {
      await caller.auth.acceptInvite({ token: plainToken });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("BAD_REQUEST");
  });

  it("invalid/unknown token → BAD_REQUEST", async () => {
    const acceptEm = orm.em.fork();
    const caller = createCaller(
      createContext({
        session: null,
        orgId: null,
        userId: null,
        em: acceptEm as unknown as import("@mikro-orm/postgresql").EntityManager,
        container: null,
      }),
    );

    let error: TRPCError | null = null;
    try {
      await caller.auth.acceptInvite({ token: "completely-invalid-token" });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("BAD_REQUEST");
  });

  it("already-accepted token → BAD_REQUEST", async () => {
    // Create and accept an invitation
    const inviteCaller = makeCaller(TEST_OWNER_ID, TEST_ORG_ID);
    const { token } = await inviteCaller.auth.invite({
      email: "double-accept@test.local",
      role: "member",
    });

    const firstAcceptEm = orm.em.fork();
    const firstCaller = createCaller(
      createContext({
        session: null,
        orgId: null,
        userId: null,
        em: firstAcceptEm as unknown as import("@mikro-orm/postgresql").EntityManager,
        container: null,
      }),
    );
    await firstCaller.auth.acceptInvite({ token });

    // Try to accept again
    const secondAcceptEm = orm.em.fork();
    const secondCaller = createCaller(
      createContext({
        session: null,
        orgId: null,
        userId: null,
        em: secondAcceptEm as unknown as import("@mikro-orm/postgresql").EntityManager,
        container: null,
      }),
    );
    let error: TRPCError | null = null;
    try {
      await secondCaller.auth.acceptInvite({ token });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("BAD_REQUEST");
  });
});
