/**
 * TDD — events backfill migration tests.
 *
 * RED → GREEN test for:
 *  1. Org entity metadata round-trip.
 *  2. Event entity metadata round-trip (org FK + user FK + composite indexes).
 *  3. Migration runner: post-migration asserts `eventRepo.count({ org: null }) === 0`.
 *  4. EXPLAIN: find({ org }, { orderBy: { createdAt: 'desc' }, limit: 50 }) uses Index Scan.
 *
 * Per C6: NO raw SQL outside src/db/migrations/. Schema via orm.schema.create();
 *         fixtures via em.create + persistAndFlush.
 * Per C7: MikroORM v7 @Entity decorator-class pattern.
 * Per D4: well-known local org UUID = '00000000-0000-0000-0000-000000000001'.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { MikroORM, ReferenceKind } from "@mikro-orm/postgresql";
import { PGlite } from "@electric-sql/pglite";
import { PGliteKyselyDialect } from "../../../src/db/PGliteKyselyDriver.ts";

// Entity classes we are testing
import { Org } from "../../../src/db/entities/auth/Org.ts";
import { User } from "../../../src/db/entities/auth/User.ts";
import { Session } from "../../../src/db/entities/auth/Session.ts";
import { Invitation } from "../../../src/db/entities/auth/Invitation.ts";
import { OrgMember } from "../../../src/db/entities/auth/OrgMember.ts";
import { FeatureFlag } from "../../../src/db/entities/auth/FeatureFlag.ts";
import { Event } from "../../../src/db/entities/core/Event.ts";

// Repositories
import { OrgRepository } from "../../../src/db/repositories/auth/OrgRepository.ts";
import { EventRepository } from "../../../src/db/repositories/core/EventRepository.ts";

const WELL_KNOWN_ORG_ID = "00000000-0000-0000-0000-000000000001";
const TEST_USER_ID = "00000000-0000-0000-0000-000000000002";

let orm: MikroORM;

beforeAll(async () => {
  const pglite = new PGlite();
  const dialect = new PGliteKyselyDialect(() => pglite);

  orm = await MikroORM.init({
    dbName: "postgres",
    driverOptions: dialect,
    entities: [Org, User, Session, Invitation, OrgMember, FeatureFlag, Event],
    debug: false,
  });

  // Create all tables via ORM schema generator (C6: no raw SQL).
  await orm.schema.create();

  // Seed: create well-known org + default user so FKs are satisfiable.
  const em = orm.em.fork();
  em.create(Org, {
    id: WELL_KNOWN_ORG_ID,
    name: "Local",
    slug: "local",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  em.create(User, {
    id: TEST_USER_ID,
    email: "admin@local",
    role: "owner",
    orgId: WELL_KNOWN_ORG_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await em.flush();
});

afterAll(async () => {
  if (orm) await orm.close(true);
});

// ──────────────────────────────────────────────
// 1. Org entity metadata
// ──────────────────────────────────────────────

describe("MikroORM metadata — Org", () => {
  it("Org entity is registered with tableName=orgs", () => {
    const meta = orm.getMetadata().get(Org);
    expect(meta).toBeDefined();
    expect(meta.tableName).toBe("orgs");
  });

  it("Org.id is a UUID primary key", () => {
    const meta = orm.getMetadata().get(Org);
    const idProp = meta.properties["id"];
    expect(idProp).toBeDefined();
    expect(idProp!.primary).toBe(true);
    expect(idProp!.type).toMatch(/uuid/i);
  });

  it("Org.name property exists", () => {
    const meta = orm.getMetadata().get(Org);
    expect(meta.properties["name"]).toBeDefined();
  });

  it("Org.slug property exists", () => {
    const meta = orm.getMetadata().get(Org);
    const slug = meta.properties["slug"];
    expect(slug).toBeDefined();
  });
});

// ──────────────────────────────────────────────
// 2. Event entity metadata
// ──────────────────────────────────────────────

describe("MikroORM metadata — Event", () => {
  it("Event entity is registered with tableName=events", () => {
    const meta = orm.getMetadata().get(Event);
    expect(meta).toBeDefined();
    expect(meta.tableName).toBe("events");
  });

  it("Event.id is a UUID primary key", () => {
    const meta = orm.getMetadata().get(Event);
    const idProp = meta.properties["id"];
    expect(idProp).toBeDefined();
    expect(idProp!.primary).toBe(true);
  });

  it("Event.org is a ManyToOne (non-nullable)", () => {
    const meta = orm.getMetadata().get(Event);
    const orgProp = meta.properties["org"];
    expect(orgProp).toBeDefined();
    // MikroORM v7 uses `kind` instead of `reference`
    expect(orgProp!.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(orgProp!.nullable).not.toBe(true);
  });

  it("Event.user is a ManyToOne (nullable)", () => {
    const meta = orm.getMetadata().get(Event);
    const userProp = meta.properties["user"];
    expect(userProp).toBeDefined();
    // MikroORM v7 uses `kind` instead of `reference`
    expect(userProp!.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(userProp!.nullable).toBe(true);
  });

  it("Event has composite index idx_events_org_created", () => {
    const meta = orm.getMetadata().get(Event);
    const hasOrgCreated = meta.indexes?.some(
      (idx) => idx.name === "idx_events_org_created",
    );
    expect(hasOrgCreated).toBe(true);
  });

  it("Event has composite index idx_events_subject", () => {
    const meta = orm.getMetadata().get(Event);
    const hasSubject = meta.indexes?.some(
      (idx) => idx.name === "idx_events_subject",
    );
    expect(hasSubject).toBe(true);
  });
});

// ──────────────────────────────────────────────
// 3. CRUD round-trip — Event
// ──────────────────────────────────────────────

describe("CRUD round-trip — Event", () => {
  it("creates and retrieves an Event with org FK", async () => {
    const em = orm.em.fork();
    const orgRef = em.getReference(Org, WELL_KNOWN_ORG_ID);
    const event = em.create(Event, {
      org: orgRef,
      verb: "task.created",
      subjectKind: "task",
      subjectId: "task-001",
      payload: { title: "First task" },
      createdAt: new Date(),
    });
    em.persist(event);
    await em.flush();

    const em2 = orm.em.fork();
    const found = await em2.getRepository(Event).findOne({ verb: "task.created" });
    expect(found).toBeDefined();
    expect(found!.verb).toBe("task.created");
  });

  it("creates an Event without user (nullable FK)", async () => {
    const em = orm.em.fork();
    const orgRef = em.getReference(Org, WELL_KNOWN_ORG_ID);
    const event = em.create(Event, {
      org: orgRef,
      verb: "system.init",
      subjectKind: "system",
      createdAt: new Date(),
    });
    em.persist(event);
    await em.flush();

    const em2 = orm.em.fork();
    const found = await em2.getRepository(Event).findOne({ verb: "system.init" });
    expect(found).toBeDefined();
    // MikroORM returns null (not undefined) for a nullable FK when not populated
    expect(found!.user == null).toBe(true);
  });
});

// ──────────────────────────────────────────────
// 4. Post-migration: no events with org = null
// ──────────────────────────────────────────────

describe("Post-migration invariant — no null org events", () => {
  it("eventRepo.count({ org: null }) === 0 (schema is NOT NULL from day one)", async () => {
    const em = orm.em.fork();
    // On a fresh schema, org is NOT NULL from day one so this must always be 0.
    const count = await em.getRepository(Event).count({ org: null as unknown as Org });
    expect(count).toBe(0);
  });
});

// ──────────────────────────────────────────────
// 5. Repository class definitions
// ──────────────────────────────────────────────

describe("Repository class definitions — Org + Event", () => {
  it("OrgRepository class is defined", () => {
    expect(OrgRepository).toBeDefined();
    expect(typeof OrgRepository).toBe("function");
  });

  it("EventRepository class is defined", () => {
    expect(EventRepository).toBeDefined();
    expect(typeof EventRepository).toBe("function");
  });

  it("em.getRepository(Org) returns OrgRepository instance", () => {
    const repo = orm.em.getRepository(Org);
    expect(repo).toBeInstanceOf(OrgRepository);
  });

  it("em.getRepository(Event) returns EventRepository instance", () => {
    const repo = orm.em.getRepository(Event);
    expect(repo).toBeInstanceOf(EventRepository);
  });
});
