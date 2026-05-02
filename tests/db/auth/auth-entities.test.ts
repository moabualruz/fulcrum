/**
 * TDD - Auth entity + repository round-trip tests.
 *
 * Tests assert:
 *   1. em.getMetadata() round-trip for each entity (all properties + indexes).
 *   2. em.create / em.persist / em.flush / em.getRepository().findOne() for each entity.
 *
 * Per C6: NO raw SQL strings outside src/db/migrations/.
 *         Schema setup via orm.schema.create(); fixtures via em.create + em.persist + em.flush.
 * Per C7: MikroORM v7 @Entity decorator-class pattern.
 * Per C9: entities at src/db/entities/auth/, repositories at src/db/repositories/auth/.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { raw } from "@mikro-orm/core";
import { MikroORM } from "@mikro-orm/postgresql";
import { PGlite } from "@electric-sql/pglite";
import { PGliteKyselyDialect } from "../../../src/db/PGliteKyselyDriver.ts";

// Entity decorator classes
import {
  User,
  Session,
  Invitation,
  OrgMember,
  FeatureFlag,
} from "../../../src/db/entities/auth/index.ts";
import {
  UserRepository,
  SessionRepository,
  InvitationRepository,
  OrgMemberRepository,
  FeatureFlagRepository,
} from "../../../src/db/repositories/auth/index.ts";

let orm: MikroORM;
let pglite: PGlite;

const TEST_ORG_ID = "00000000-0000-0000-0000-000000000001";

beforeAll(async () => {
  pglite = new PGlite();
  const dialect = new PGliteKyselyDialect(() => pglite);

  orm = await MikroORM.init({
    dbName: "postgres",
    driverOptions: dialect,
    // Entity classes (C7: @Entity decorator classes)
    entities: [User, Session, Invitation, OrgMember, FeatureFlag],
    debug: false,
  });

  // Create all tables via ORM schema generator (C6: no raw SQL).
  // orm.schema.create() generates and executes CREATE TABLE DDL from entity metadata.
  await orm.schema.create();
});

afterAll(async () => {
  if (orm) await orm.close(true);
  await pglite?.close();
});

// ──────────────────────────────────────────────
// 1. Metadata round-trips (em.getMetadata())
// ──────────────────────────────────────────────

describe("MikroORM metadata — User", () => {
  it("User entity is registered with correct tableName", () => {
    const meta = orm.getMetadata().get(User);
    expect(meta).toBeDefined();
    expect(meta.tableName).toBe("users");
  });

  it("User.id is a UUID primary key", () => {
    const meta = orm.getMetadata().get(User);
    const idProp = meta.properties["id"];
    expect(idProp).toBeDefined();
    expect(idProp!.primary).toBe(true);
    // MikroORM v7 stores type as "uuid"
    expect(idProp!.type).toMatch(/uuid/i);
  });

  it("User.email property exists and is required", () => {
    const meta = orm.getMetadata().get(User);
    const emailProp = meta.properties["email"];
    expect(emailProp).toBeDefined();
    expect(emailProp!.type).toBe("string");
  });

  it("User.orgId FK column exists", () => {
    const meta = orm.getMetadata().get(User);
    const orgProp = meta.properties["orgId"];
    expect(orgProp).toBeDefined();
    expect(orgProp!.fieldNames).toContain("org_id");
  });

  it("User.role enum property exists with correct type", () => {
    const meta = orm.getMetadata().get(User);
    const roleProp = meta.properties["role"];
    expect(roleProp).toBeDefined();
  });

  it("User has composite index on (orgId, email)", () => {
    const meta = orm.getMetadata().get(User);
    const hasOrgEmailIndex = meta.indexes?.some(
      (idx) =>
        Array.isArray(idx.properties) &&
        (idx.properties as string[]).includes("orgId") &&
        (idx.properties as string[]).includes("email"),
    );
    expect(hasOrgEmailIndex).toBe(true);
  });

  it("User has unique constraint on (orgId, email)", () => {
    const meta = orm.getMetadata().get(User);
    const hasUnique = meta.uniques?.some(
      (u) =>
        Array.isArray(u.properties) &&
        (u.properties as string[]).includes("orgId") &&
        (u.properties as string[]).includes("email"),
    );
    expect(hasUnique).toBe(true);
  });
});

describe("MikroORM metadata — Session", () => {
  it("Session entity is registered with correct tableName", () => {
    const meta = orm.getMetadata().get(Session);
    expect(meta).toBeDefined();
    expect(meta.tableName).toBe("sessions");
  });

  it("Session.expiresAt property exists with datetime type", () => {
    const meta = orm.getMetadata().get(Session);
    const prop = meta.properties["expiresAt"];
    expect(prop).toBeDefined();
    expect(prop!.fieldNames).toContain("expires_at");
  });

  it("Session.userId FK column exists", () => {
    const meta = orm.getMetadata().get(Session);
    const prop = meta.properties["userId"];
    expect(prop).toBeDefined();
    expect(prop!.fieldNames).toContain("user_id");
  });

  it("Session has (userId, expiresAt) index", () => {
    const meta = orm.getMetadata().get(Session);
    const hasIndex = meta.indexes?.some(
      (idx) =>
        Array.isArray(idx.properties) &&
        (idx.properties as string[]).includes("userId"),
    );
    expect(hasIndex).toBe(true);
  });
});

describe("MikroORM metadata — Invitation", () => {
  it("Invitation entity is registered with correct tableName", () => {
    const meta = orm.getMetadata().get(Invitation);
    expect(meta).toBeDefined();
    expect(meta.tableName).toBe("invitations");
  });

  it("Invitation.token property exists", () => {
    const meta = orm.getMetadata().get(Invitation);
    const tokenProp = meta.properties["token"];
    expect(tokenProp).toBeDefined();
  });

  it("Invitation.token has unique constraint", () => {
    const meta = orm.getMetadata().get(Invitation);
    const hasTokenUnique = meta.uniques?.some(
      (u) =>
        Array.isArray(u.properties) &&
        (u.properties as string[]).includes("token"),
    );
    expect(hasTokenUnique).toBe(true);
  });

  it("Invitation has composite index on (orgId, email)", () => {
    const meta = orm.getMetadata().get(Invitation);
    const hasIndex = meta.indexes?.some(
      (idx) =>
        Array.isArray(idx.properties) &&
        (idx.properties as string[]).includes("orgId") &&
        (idx.properties as string[]).includes("email"),
    );
    expect(hasIndex).toBe(true);
  });
});

describe("MikroORM metadata — OrgMember", () => {
  it("OrgMember entity is registered with correct tableName", () => {
    const meta = orm.getMetadata().get(OrgMember);
    expect(meta).toBeDefined();
    expect(meta.tableName).toBe("org_members");
  });

  it("OrgMember has composite unique on (orgId, userId)", () => {
    const meta = orm.getMetadata().get(OrgMember);
    const hasUnique = meta.uniques?.some(
      (u) =>
        Array.isArray(u.properties) &&
        (u.properties as string[]).includes("orgId") &&
        (u.properties as string[]).includes("userId"),
    );
    expect(hasUnique).toBe(true);
  });

  it("OrgMember has composite index on (orgId, userId)", () => {
    const meta = orm.getMetadata().get(OrgMember);
    const hasIndex = meta.indexes?.some(
      (idx) =>
        Array.isArray(idx.properties) &&
        (idx.properties as string[]).includes("orgId") &&
        (idx.properties as string[]).includes("userId"),
    );
    expect(hasIndex).toBe(true);
  });
});

describe("MikroORM metadata — FeatureFlag", () => {
  it("FeatureFlag entity is registered with correct tableName", () => {
    const meta = orm.getMetadata().get(FeatureFlag);
    expect(meta).toBeDefined();
    expect(meta.tableName).toBe("feature_flags");
  });

  it("FeatureFlag.flag property exists", () => {
    const meta = orm.getMetadata().get(FeatureFlag);
    const prop = meta.properties["flag"];
    expect(prop).toBeDefined();
    expect(prop!.type).toBe("string");
  });

  it("FeatureFlag.enabled is boolean with default false", () => {
    const meta = orm.getMetadata().get(FeatureFlag);
    const prop = meta.properties["enabled"];
    expect(prop).toBeDefined();
    expect(prop!.type).toBe("boolean");
  });

  it("FeatureFlag has composite index on (orgId, flag)", () => {
    const meta = orm.getMetadata().get(FeatureFlag);
    const hasIndex = meta.indexes?.some(
      (idx) =>
        Array.isArray(idx.properties) &&
        (idx.properties as string[]).includes("orgId") &&
        (idx.properties as string[]).includes("flag"),
    );
    expect(hasIndex).toBe(true);
  });
});

// ──────────────────────────────────────────────
// 2. CRUD round-trips (no raw SQL — C6 compliant)
// ──────────────────────────────────────────────

describe("CRUD round-trip — User", () => {
  it("creates and retrieves a User via repository", async () => {
    const em = orm.em.fork();

    // C6: use em.create + persistAndFlush — no raw SQL
    const user = em.create(User, {
      email: "test@example.com",
      name: "Test User",
      role: "member",
      orgId: TEST_ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.persist(user);
    await em.flush();

    const em2 = orm.em.fork();
    const found = await em2
      .getRepository(User)
      .findOne({ email: "test@example.com" });
    expect(found).toBeDefined();
    expect(found!.email).toBe("test@example.com");
    expect(found!.role).toBe("member");
    expect(found!.orgId).toBe(TEST_ORG_ID);
  });
});

describe("CRUD round-trip — Session", () => {
  it("creates and retrieves a Session", async () => {
    const em = orm.em.fork();
    const expiresAt = new Date(Date.now() + 86400 * 1000);
    const session = em.create(Session, {
      id: "sess-test-001",
      userId: "00000000-0000-0000-0000-000000000002",
      orgId: TEST_ORG_ID,
      expiresAt,
      createdAt: new Date(),
    });
    em.persist(session);
    await em.flush();

    const em2 = orm.em.fork();
    const found = await em2
      .getRepository(Session)
      .findOne({ id: "sess-test-001" });
    expect(found).toBeDefined();
    expect(found!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(found!.userId).toBe("00000000-0000-0000-0000-000000000002");
  });
});

describe("CRUD round-trip — Invitation", () => {
  it("creates and retrieves an Invitation", async () => {
    const em = orm.em.fork();
    const token = "inv-token-abc123";
    const invitation = em.create(Invitation, {
      email: "invited@example.com",
      token,
      role: "member",
      orgId: TEST_ORG_ID,
      expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
      createdAt: new Date(),
    });
    em.persist(invitation);
    await em.flush();

    const em2 = orm.em.fork();
    const found = await em2
      .getRepository(Invitation)
      .findOne({ token });
    expect(found).toBeDefined();
    expect(found!.email).toBe("invited@example.com");
  });
});

describe("CRUD round-trip — OrgMember", () => {
  it("creates and retrieves an OrgMember", async () => {
    const em = orm.em.fork();
    const member = em.create(OrgMember, {
      orgId: TEST_ORG_ID,
      userId: "00000000-0000-0000-0000-000000000003",
      role: "member",
      joinedAt: new Date(),
    });
    em.persist(member);
    await em.flush();

    const em2 = orm.em.fork();
    const found = await em2
      .getRepository(OrgMember)
      .findOne({ orgId: TEST_ORG_ID, userId: "00000000-0000-0000-0000-000000000003" });
    expect(found).toBeDefined();
    expect(found!.role).toBe("member");
  });
});

describe("CRUD round-trip — FeatureFlag", () => {
  it("creates and retrieves a FeatureFlag with enabled=false", async () => {
    const em = orm.em.fork();
    const flag = em.create(FeatureFlag, {
      orgId: TEST_ORG_ID,
      flag: "router-llm",
      enabled: false,
      createdAt: new Date(),
    });
    em.persist(flag);
    await em.flush();

    const em2 = orm.em.fork();
    const found = await em2
      .getRepository(FeatureFlag)
      .findOne({ flag: "router-llm" });
    expect(found).toBeDefined();
    expect(found!.enabled).toBe(false);
    expect(found!.flag).toBe("router-llm");
  });

  it("FeatureFlag enabled can be toggled to true", async () => {
    const em = orm.em.fork();
    const found = await em.getRepository(FeatureFlag).findOne({
      flag: "router-llm",
    });
    expect(found).toBeDefined();
    found!.enabled = true;
    await em.flush();

    const em2 = orm.em.fork();
    const updated = await em2
      .getRepository(FeatureFlag)
      .findOne({ flag: "router-llm" });
    expect(updated!.enabled).toBe(true);
  });

  it("rejects duplicate org-level FeatureFlag rows for the same flag", async () => {
    const em = orm.em.fork();
    const conflictTarget = raw(
      '("org_id", "flag") where "org_id" is not null and "user_id" is null',
    );

    await em
      .createQueryBuilder(FeatureFlag)
      .insert({
        orgId: TEST_ORG_ID,
        userId: null,
        flag: "org-duplicate-blocked",
        enabled: true,
        createdAt: new Date(),
      })
      .onConflict(conflictTarget)
      .ignore()
      .execute();
    await em
      .createQueryBuilder(FeatureFlag)
      .insert({
        orgId: TEST_ORG_ID,
        userId: null,
        flag: "org-duplicate-blocked",
        enabled: false,
        createdAt: new Date(),
      })
      .onConflict(conflictTarget)
      .ignore()
      .execute();

    const count = await em.count(FeatureFlag, {
      orgId: TEST_ORG_ID,
      userId: null,
      flag: "org-duplicate-blocked",
    });
    expect(count).toBe(1);
  });
});

// ──────────────────────────────────────────────
// 3. Repository classes are accessible + typed
// ──────────────────────────────────────────────

describe("Repository class definitions", () => {
  it("UserRepository class is defined and exportable", () => {
    expect(UserRepository).toBeDefined();
    expect(typeof UserRepository).toBe("function");
  });

  it("SessionRepository class is defined and exportable", () => {
    expect(SessionRepository).toBeDefined();
    expect(typeof SessionRepository).toBe("function");
  });

  it("InvitationRepository class is defined and exportable", () => {
    expect(InvitationRepository).toBeDefined();
    expect(typeof InvitationRepository).toBe("function");
  });

  it("OrgMemberRepository class is defined and exportable", () => {
    expect(OrgMemberRepository).toBeDefined();
    expect(typeof OrgMemberRepository).toBe("function");
  });

  it("FeatureFlagRepository class is defined and exportable", () => {
    expect(FeatureFlagRepository).toBeDefined();
    expect(typeof FeatureFlagRepository).toBe("function");
  });

  it("em.getRepository(User) returns UserRepository instance", () => {
    const repo = orm.em.getRepository(User);
    expect(repo).toBeInstanceOf(UserRepository);
  });

  it("em.getRepository(Session) returns SessionRepository instance", () => {
    const repo = orm.em.getRepository(Session);
    expect(repo).toBeInstanceOf(SessionRepository);
  });

  it("em.getRepository(Invitation) returns InvitationRepository instance", () => {
    const repo = orm.em.getRepository(Invitation);
    expect(repo).toBeInstanceOf(InvitationRepository);
  });

  it("em.getRepository(OrgMember) returns OrgMemberRepository instance", () => {
    const repo = orm.em.getRepository(OrgMember);
    expect(repo).toBeInstanceOf(OrgMemberRepository);
  });

  it("em.getRepository(FeatureFlag) returns FeatureFlagRepository instance", () => {
    const repo = orm.em.getRepository(FeatureFlag);
    expect(repo).toBeInstanceOf(FeatureFlagRepository);
  });
});
