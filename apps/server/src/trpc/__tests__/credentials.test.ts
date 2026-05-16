/**
 * credentials tRPC procedure tests — Pillar 17 secrets vault.
 *
 * Acceptance:
 *   - set: stores ciphertext only; plaintext absent from DB
 *   - get: authorized → plaintext; unauthorized → FORBIDDEN
 *   - list: excludes archived by default; never returns ciphertext/plaintext
 *   - rotate: replaces ciphertext, bumps last_used_at
 *   - archive: hides from list
 *   - remove: deletes row
 *   - all procedures protectedProcedure → UNAUTHORIZED without session
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { TRPCError } from "@trpc/server";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createTestOrm, destroyTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { User } from "@identity-access/infrastructure/database/entities/auth/User.ts";
import { OrgMember } from "@identity-access/infrastructure/database/entities/auth/OrgMember.ts";
import { Credential } from "@platform-core/infrastructure/application-database/entities/platform/Credential.ts";
import { CredentialRepository } from "@platform-core/infrastructure/application-database/repositories/platform/CredentialRepository.ts";
import { OrgMemberRepository } from "@identity-access/infrastructure/database/repositories/auth/OrgMemberRepository.ts";
import { CasbinRuleRepository } from "@platform-core/infrastructure/application-database/repositories/flags/CasbinRuleRepository.ts";
import { FlagRegistry } from "@platform-core/application/feature-flags/registry.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import { SecretsKeyringToken } from "@platform-core/application/secrets/keyring.ts";
import type { NativeKeyringAdapter } from "@platform-core/application/secrets/keyring.ts";

const TEST_ORG_ID = "00000000-0000-0000-0000-000000000001";
const TEST_OWNER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const TEST_ADMIN_ID = "c3d4e5f6-a7b8-4c9d-90e1-f2a3b4c5d6e7";
const TEST_MEMBER_ID = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
const TEST_OTHER_ID = "d4e5f6a7-b8c9-4d0e-91f2-a3b4c5d6e7f8";
const TEST_MEMBERS = [
  [TEST_OWNER_ID, "owner"],
  [TEST_ADMIN_ID, "admin"],
  [TEST_MEMBER_ID, "member"],
  [TEST_OTHER_ID, "member"],
] as const;

let testOrm: TestOrm;
let stateDir: string;
let sharedNative: NativeKeyringAdapter;

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

function inMemoryNative(): NativeKeyringAdapter {
  const store = new Map<string, string>();
  return {
    async getPassword(s, a) {
      return store.get(`${s}:${a}`) ?? null;
    },
    async setPassword(s, a, p) {
      store.set(`${s}:${a}`, p);
    },
  };
}

function makeCaller(
  userId: string,
  orgId: string,
  options: { casbinActions?: string[] } = {},
) {
  const em = testOrm.em;
  const credentialRepo = em.getRepository(Credential) as CredentialRepository;
  const orgMemberRepo = em.getRepository(OrgMember) as OrgMemberRepository;

  const c = null;
  c.bind({ provide: CredentialRepository, useValue: credentialRepo });
  c.bind({ provide: OrgMemberRepository, useValue: orgMemberRepo });
  c.bind({
    provide: FlagRegistry,
    useValue: {
      isEnabled: async (flag: string) =>
        flag === "casbin-policies" && options.casbinActions !== undefined,
    } as unknown as FlagRegistry,
  });
  c.bind({
    provide: CasbinRuleRepository,
    useValue: {
      findAll: async () =>
        (options.casbinActions ?? []).map((action) => ({
          ptype: "p",
          v0: orgId,
          v1: userId,
          v2: "credentials",
          v3: action,
        })),
    } as unknown as CasbinRuleRepository,
  });
  c.bind({
    provide: SecretsKeyringToken,
    useValue: { stateDir, native: sharedNative },
  });

  return createCaller(
    createContext({
      session: mockSession(userId, orgId) as unknown as import("better-auth").Session,
      orgId,
      userId,
      em,
      container: c,
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
  stateDir = mkdtempSync(join(tmpdir(), "fulcrum-cred-test-"));
  sharedNative = inMemoryNative();

  const seed = testOrm.em;
  const now = new Date();
  const org = seed.create(Org, {
    id: TEST_ORG_ID,
    name: "Test Org",
    slug: "test-org",
    createdAt: now,
    updatedAt: now,
  });
  for (const [id, role] of TEST_MEMBERS) {
    seed.create(User, {
      id,
      email: `${role}-${id.slice(0, 4)}@test.local`,
      name: role,
      orgId: TEST_ORG_ID,
      role,
      createdAt: now,
      updatedAt: now,
    });
    seed.create(OrgMember, {
      orgId: TEST_ORG_ID,
      userId: id,
      role,
      joinedAt: now,
    });
  }
  seed.persist(org);
  await seed.flush();
});

afterAll(async () => {
  await destroyTestOrm();
  if (stateDir) rmSync(stateDir, { recursive: true, force: true });
});

beforeEach(async () => {
  const em = testOrm.em;
  await em.nativeDelete(Credential, {});
  await em.nativeDelete(OrgMember, {});
  const now = new Date();
  for (const [id, role] of TEST_MEMBERS) {
    const member = em.create(OrgMember, {
      orgId: TEST_ORG_ID,
      userId: id,
      role,
      joinedAt: now,
    });
    em.persist(member);
  }
  /* flushed */
});

describe("credentials.set", () => {
  it("stores ciphertext only; plaintext absent from DB", async () => {
    const caller = makeCaller(TEST_OWNER_ID, TEST_ORG_ID);
    const r = await caller.credentials.set({ name: "openai", value: "sk-plaintext-XYZ" });
    expect(r.id).toBeTruthy();
    expect(r.name).toBe("openai");

    const em = testOrm.em;
    const row = await em.findOne(Credential, { name: "openai", org: TEST_ORG_ID } as object);
    expect(row).not.toBeNull();
    const ct = (row as Credential).encryptedValue;
    expect(ct.length).toBeGreaterThan(0);
    expect(Buffer.from(ct).toString("utf8")).not.toContain("sk-plaintext-XYZ");
  });

  it("upsert: same name overwrites ciphertext", async () => {
    const caller = makeCaller(TEST_OWNER_ID, TEST_ORG_ID);
    await caller.credentials.set({ name: "k", value: "v1" });
    await caller.credentials.set({ name: "k", value: "v2" });
    const got = await caller.credentials.get({ name: "k" });
    expect(got.value).toBe("v2");
  });
});

describe("credentials.get", () => {
  it("owner of cred → plaintext", async () => {
    const caller = makeCaller(TEST_OWNER_ID, TEST_ORG_ID);
    await caller.credentials.set({ name: "stripe", value: "rk_live_XYZ" });
    const r = await caller.credentials.get({ name: "stripe" });
    expect(r.value).toBe("rk_live_XYZ");
    expect(r.name).toBe("stripe");
  });

  it("org-admin can read another user's cred in same org", async () => {
    const owner = makeCaller(TEST_OWNER_ID, TEST_ORG_ID);
    await owner.credentials.set({ name: "shared", value: "secret-X" });
    const admin = makeCaller(TEST_ADMIN_ID, TEST_ORG_ID);
    const r = await admin.credentials.get({ name: "shared", userId: TEST_OWNER_ID });
    expect(r.value).toBe("secret-X");
  });

  it("non-owner non-admin → FORBIDDEN", async () => {
    const owner = makeCaller(TEST_OWNER_ID, TEST_ORG_ID);
    await owner.credentials.set({ name: "private", value: "no" });
    const other = makeCaller(TEST_OTHER_ID, TEST_ORG_ID);
    let err: TRPCError | null = null;
    try {
      await other.credentials.get({ name: "private", userId: TEST_OWNER_ID });
    } catch (e) {
      if (e instanceof TRPCError) err = e;
    }
    expect(err?.code).toBe("FORBIDDEN");
  });

  it("missing cred → NOT_FOUND", async () => {
    const caller = makeCaller(TEST_OWNER_ID, TEST_ORG_ID);
    let err: TRPCError | null = null;
    try {
      await caller.credentials.get({ name: "nope" });
    } catch (e) {
      if (e instanceof TRPCError) err = e;
    }
    expect(err?.code).toBe("NOT_FOUND");
  });
});

describe("credentials.list", () => {
  it("excludes archived by default; never returns ciphertext/plaintext", async () => {
    const caller = makeCaller(TEST_OWNER_ID, TEST_ORG_ID);
    await caller.credentials.set({ name: "a", value: "v1" });
    await caller.credentials.set({ name: "b", value: "v2" });
    await caller.credentials.archive({ name: "b" });

    const rows = await caller.credentials.list();
    expect(rows.length).toBe(1);
    expect(rows[0]!.name).toBe("a");
    // never shape leakage
    expect((rows[0] as Record<string, unknown>).value).toBeUndefined();
    expect((rows[0] as Record<string, unknown>).encryptedValue).toBeUndefined();
  });

  it("includeArchived=true returns archived rows too", async () => {
    const caller = makeCaller(TEST_OWNER_ID, TEST_ORG_ID);
    await caller.credentials.set({ name: "a", value: "v" });
    await caller.credentials.archive({ name: "a" });
    const rows = await caller.credentials.list({ includeArchived: true });
    expect(rows.length).toBe(1);
    expect(rows[0]!.archived).toBe(true);
  });
});

describe("credentials.rotate", () => {
  it("replaces ciphertext and bumps lastUsedAt", async () => {
    const caller = makeCaller(TEST_OWNER_ID, TEST_ORG_ID);
    await caller.credentials.set({ name: "rot", value: "v-old" });
    const em = testOrm.em;
    const before = await em.findOne(Credential, { name: "rot", org: TEST_ORG_ID } as object);
    const ctBefore = Buffer.from((before as Credential).encryptedValue);

    await caller.credentials.rotate({ name: "rot", newValue: "v-new" });

    em.clear();
    const after = await em.findOne(Credential, { name: "rot", org: TEST_ORG_ID } as object);
    const ctAfter = Buffer.from((after as Credential).encryptedValue);
    expect(ctAfter.equals(ctBefore)).toBe(false);
    expect((after as Credential).lastUsedAt).toBeInstanceOf(Date);

    const got = await caller.credentials.get({ name: "rot" });
    expect(got.value).toBe("v-new");
  });
});

describe("credentials.archive / remove", () => {
  it("archive sets archived=true", async () => {
    const caller = makeCaller(TEST_OWNER_ID, TEST_ORG_ID);
    await caller.credentials.set({ name: "x", value: "v" });
    await caller.credentials.archive({ name: "x" });
    const em = testOrm.em;
    const row = await em.findOne(Credential, { name: "x", org: TEST_ORG_ID } as object);
    expect((row as Credential).archived).toBe(true);
  });

  it("remove deletes row", async () => {
    const caller = makeCaller(TEST_OWNER_ID, TEST_ORG_ID);
    await caller.credentials.set({ name: "rm", value: "v" });
    await caller.credentials.remove({ name: "rm" });
    const em = testOrm.em;
    const row = await em.findOne(Credential, { name: "rm", org: TEST_ORG_ID } as object);
    expect(row).toBeNull();
  });
});

describe("credentials casbin-policies integration", () => {
  it("maps credentials mutation verbs so Casbin-enabled set/rotate/archive/remove reach resolvers", async () => {
    const caller = makeCaller(TEST_OWNER_ID, TEST_ORG_ID, {
      casbinActions: ["set", "rotate", "archive", "remove"],
    });

    await caller.credentials.set({ name: "casbin", value: "v1" });
    await caller.credentials.rotate({ name: "casbin", newValue: "v2" });
    await caller.credentials.archive({ name: "casbin" });
    await caller.credentials.remove({ name: "casbin" });

    const em = testOrm.em;
    const row = await em.findOne(Credential, { name: "casbin", org: TEST_ORG_ID } as object);
    expect(row).toBeNull();
  });
});

describe("credentials active membership gate", () => {
  it("blocks stale-session self get/list/set after OrgMember removal", async () => {
    const activeCaller = makeCaller(TEST_MEMBER_ID, TEST_ORG_ID);
    await activeCaller.credentials.set({ name: "stale", value: "plaintext-before-remove" });

    const adminEm = testOrm.em;
    await adminEm.nativeDelete(OrgMember, {
      orgId: TEST_ORG_ID,
      userId: TEST_MEMBER_ID,
    } as object);

    const staleCaller = makeCaller(TEST_MEMBER_ID, TEST_ORG_ID);

    for (const attempt of [
      () => staleCaller.credentials.get({ name: "stale" }),
      () => staleCaller.credentials.list(),
      () => staleCaller.credentials.set({ name: "after-removal", value: "must-not-write" }),
    ]) {
      let err: TRPCError | null = null;
      try {
        await attempt();
      } catch (e) {
        if (e instanceof TRPCError) err = e;
      }
      expect(err?.code).toBe("FORBIDDEN");
    }

    const checkEm = testOrm.em;
    const blockedWrite = await checkEm.findOne(Credential, {
      name: "after-removal",
      org: TEST_ORG_ID,
    } as object);
    expect(blockedWrite).toBeNull();
  });
});

describe("credentials.* unauthenticated", () => {
  it("list → UNAUTHORIZED", async () => {
    const caller = unauthCaller();
    let err: TRPCError | null = null;
    try {
      await caller.credentials.list();
    } catch (e) {
      if (e instanceof TRPCError) err = e;
    }
    expect(err?.code).toBe("UNAUTHORIZED");
  });

  it("set → UNAUTHORIZED", async () => {
    const caller = unauthCaller();
    let err: TRPCError | null = null;
    try {
      await caller.credentials.set({ name: "a", value: "b" });
    } catch (e) {
      if (e instanceof TRPCError) err = e;
    }
    expect(err?.code).toBe("UNAUTHORIZED");
  });
});
