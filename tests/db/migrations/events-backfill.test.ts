/**
 * TDD — events backfill migration: single-ORM Phase 1-4 round-trip + EXPLAIN.
 *
 * Single-ORM Phase 1–4 architecture (Blocker 1 fix — round-3):
 *
 *  PHASE 1 — run auth migration only on a fresh PGlite (single ORM instance).
 *    Apply Migration20260501104413_auth. Stop before events backfill.
 *    The events table does not yet exist.
 *
 *  PHASE 2 — pre-seed null-org state before events backfill runs (C6 carve-out).
 *    Using sanctioned raw conn.execute() calls (the ONLY way to construct a
 *    pre-migration schema state; no entity-class path exists at this point):
 *      (a) create "orgs" table (same columns as migration; without the unique
 *          constraint — the migration adds it via ALTER TABLE afterward)
 *      (b) seed the well-known org row (D4: '00000000-0000-0000-0000-000000000001')
 *          required for the FK the migration adds in step 5
 *      (c) create "events" table with org_id NULL — the migration uses
 *          CREATE TABLE IF NOT EXISTS so this pre-created table is preserved
 *      (d) insert one event row with org_id = NULL (the pre-existing null-org row)
 *
 *  PHASE 3 — run the events backfill migration via the SAME ORM instance.
 *    migrator.up({ to: 'Migration20260501120537_events_org_id_backfill' })
 *    The migration's CREATE TABLE IF NOT EXISTS steps skip the pre-created tables.
 *    The backfill UPDATE runs against the live null-org row seeded in Phase 2.
 *    NOT NULL / FK / indexes complete the schema.
 *
 *  PHASE 4 — assert backfill occurred on the pre-existing row.
 *    eventRepo.count({ org: null }) === 0
 *    events WHERE verb='test.event.preexisting' has org_id = WELL_KNOWN_ORG_ID
 *
 *  PHASE C — EXPLAIN on org-predicated query (reuses the same ORM).
 *    Note: PGlite's EXPLAIN output does not guarantee "Index Scan" phrasing
 *    (PGlite's small-table planner may choose Seq Scan on empty tables even
 *    when indexes exist). We therefore assert:
 *      (a) EXPLAIN runs without error and returns at least one plan row, AND
 *      (b) the composite index names appear in em.getMetadata().get(Event).indexes,
 *          confirming the ORM metadata reflects the correct index definitions.
 *    This is the documented fallback for PGlite EXPLAIN limitations.
 *
 * Per C6: ONLY the Phase 2 setup calls use raw SQL (DDL + one INSERT).
 *         All post-migration fixture data uses em.create/flush.
 *         Raw SQL in Phase 2 is the sanctioned C6 carve-out for test setup.
 * Per C7: MikroORM v7 @Entity decorator-class pattern.
 * Per D4: well-known local org UUID = '00000000-0000-0000-0000-000000000001'.
 *
 * transactional: false / allOrNothing: false — test-only workaround for
 * PGlite's lack of savepoint support. PGliteKyselyDialect does not support
 * savepoints; migrations must run outside a wrapping transaction.
 * This setting lives ONLY in makeOrmConfig() below — NOT in src/db/mikro-orm.config.ts.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { MikroORM, ReferenceKind } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { PGlite } from "@electric-sql/pglite";
import { PGliteKyselyDialect } from "../../../src/db/PGliteKyselyDriver.ts";
import { randomUUID } from "node:crypto";

// Entity classes
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
const MIGRATION_PATH = new URL(
  "../../../src/db/migrations",
  import.meta.url,
).pathname;

// ──────────────────────────────────────────────
// Helper — builds test ORM config (PGlite, transactional:false).
// transactional:false lives HERE only — not in production mikro-orm.config.ts.
// ──────────────────────────────────────────────

function makeOrmConfig(pglite: PGlite) {
  const dialect = new PGliteKyselyDialect(() => pglite);
  return {
    dbName: "postgres",
    driverOptions: dialect,
    multipleStatements: false,
    entities: [Org, User, Session, Invitation, OrgMember, FeatureFlag, Event],
    migrations: {
      path: MIGRATION_PATH,
      pathTs: MIGRATION_PATH,
      // transactional:false / allOrNothing:false — test-only PGlite savepoint workaround.
      // PGliteKyselyDialect does not support savepoints; migrations must run without a
      // wrapping transaction. This setting MUST NOT appear in src/db/mikro-orm.config.ts.
      transactional: false,
      allOrNothing: false,
    },
    extensions: [Migrator],
    debug: false,
  };
}

// ──────────────────────────────────────────────
// Single ORM instance shared across all phases.
// ──────────────────────────────────────────────

let orm: MikroORM;

// ID of the pre-existing null-org event seeded in Phase 2.
let _preExistingEventId: string;

beforeAll(async () => {
  const pglite = new PGlite();
  orm = await MikroORM.init(makeOrmConfig(pglite));

  // ── PHASE 1: run auth migration only (no events table yet) ─────────────────
  await orm.migrator.up({
    to: "Migration20260501104413_auth",
  });

  // ── PHASE 2: pre-seed null-org state before events backfill runs ────────────
  // C6 carve-out: raw DDL + one INSERT to construct pre-migration schema state.
  // The events backfill migration uses CREATE TABLE IF NOT EXISTS so these
  // manually-created tables are preserved; the backfill UPDATE then runs against
  // our null-org row. This is the only way to simulate pre-migration data.
  const conn = orm.em.getConnection();

  // (a) Create orgs table WITHOUT the unique constraint.
  //     Migration step 1 runs CREATE TABLE IF NOT EXISTS (skips) then
  //     ALTER TABLE ... ADD CONSTRAINT "uq_orgs_slug" (adds the constraint).
  await conn.execute(
    `create table "orgs" ("id" uuid not null default gen_random_uuid(), "name" varchar(255) not null, "slug" varchar(255) not null, "avatar_url" varchar(255) null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), primary key ("id"))`,
  );

  // (b) Seed well-known local org (D4). Required for the FK the migration adds.
  await conn.execute(
    `insert into "orgs" ("id", "name", "slug", "created_at", "updated_at") values ('${WELL_KNOWN_ORG_ID}', 'Local', 'local', now(), now())`,
  );

  // (c) Create events table with org_id NULL — pre-migration state.
  //     The migration uses CREATE TABLE IF NOT EXISTS (preserved here).
  await conn.execute(
    `create table "events" ("id" uuid not null default gen_random_uuid(), "org_id" uuid null, "user_id" uuid null, "verb" varchar(255) not null, "subject_kind" varchar(255) not null, "subject_id" varchar(255) null, "payload" jsonb null, "created_at" timestamptz not null default now(), primary key ("id"))`,
  );

  // (d) Insert the pre-existing null-org event row (C6 sanctioned raw INSERT).
  //     This is the row the migration's backfill UPDATE must fix.
  //     Cannot use em.create here: Event entity requires non-nullable org post-migration.
  _preExistingEventId = randomUUID();
  await conn.execute(
    `insert into "events" ("id", "verb", "subject_kind", "created_at") values ('${_preExistingEventId}', 'test.event.preexisting', 'system', now())`,
  );

  // Verify the null-org row exists before the migration runs.
  const preCount = await orm.em
    .fork()
    .getRepository(Event)
    .count({ org: null as unknown as Org });
  if (preCount !== 1) {
    throw new Error(
      `PHASE 2 precondition failed: expected 1 null-org event, got ${preCount}`,
    );
  }

  // ── PHASE 3: run the events backfill migration ──────────────────────────────
  // CREATE TABLE IF NOT EXISTS skips orgs + events (pre-created above).
  // The backfill UPDATE sets our null-org row to WELL_KNOWN_ORG_ID.
  // NOT NULL / FK / index steps complete the schema.
  await orm.migrator.up({
    to: "Migration20260501120537_events_org_id_backfill",
  });
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
    expect(meta.properties["slug"]).toBeDefined();
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
    expect(orgProp!.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(orgProp!.nullable).not.toBe(true);
  });

  it("Event.user is a ManyToOne (nullable)", () => {
    const meta = orm.getMetadata().get(Event);
    const userProp = meta.properties["user"];
    expect(userProp).toBeDefined();
    expect(userProp!.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(userProp!.nullable).toBe(true);
  });

  it("Event has composite index idx_events_org_created (expression form with DESC)", () => {
    const meta = orm.getMetadata().get(Event);
    const idx = meta.indexes?.find((i) => i.name === "idx_events_org_created");
    expect(idx).toBeDefined();
    // expression form — no properties array, but expression string
    expect(idx!.expression).toMatch(/created_at.*DESC/i);
  });

  it("Event has composite index idx_events_subject (expression form with DESC)", () => {
    const meta = orm.getMetadata().get(Event);
    const idx = meta.indexes?.find((i) => i.name === "idx_events_subject");
    expect(idx).toBeDefined();
    expect(idx!.expression).toMatch(/created_at.*DESC/i);
  });
});

// ──────────────────────────────────────────────
// 3. Migrator round-trip: getMigrator().up() records migration
// ──────────────────────────────────────────────

describe("Migrator round-trip — getMigrator().up() records migration", () => {
  it("backfill migration is recorded in mikro_orm_migrations table", async () => {
    const storage = (
      orm.migrator as import("@mikro-orm/migrations").Migrator
    ).getStorage();
    const executed = await storage.executed();
    expect(executed).toContain(
      "Migration20260501120537_events_org_id_backfill",
    );
  });

  it("auth migration is also recorded (full chain ran)", async () => {
    const storage = (
      orm.migrator as import("@mikro-orm/migrations").Migrator
    ).getStorage();
    const executed = await storage.executed();
    expect(executed).toContain("Migration20260501104413_auth");
  });
});

// ──────────────────────────────────────────────
// PHASE 4 — Backfill assertions
// ──────────────────────────────────────────────
// The pre-existing null-org event inserted in Phase 2 must now have
// org_id = WELL_KNOWN_ORG_ID after the migrator's backfill UPDATE ran.

describe("PHASE 4 — Backfill: pre-existing null-org row now has default org", () => {
  it("eventRepo.count({ org: null }) === 0 after migration ran", async () => {
    const em = orm.em.fork();
    const count = await em
      .getRepository(Event)
      .count({ org: null as unknown as Org });
    expect(count).toBe(0);
  });

  it("pre-existing event now has org_id = WELL_KNOWN_ORG_ID", async () => {
    const em = orm.em.fork();
    const event = await em
      .getRepository(Event)
      .findOne(
        { verb: "test.event.preexisting" },
        { populate: ["org"] as never },
      );
    expect(event).toBeDefined();
    expect(event!.org.id).toBe(WELL_KNOWN_ORG_ID);
  });
});

// ──────────────────────────────────────────────
// 4. CRUD round-trip — Event (post-migrator schema)
// ──────────────────────────────────────────────

describe("CRUD round-trip — Event (post-migrator)", () => {
  it("creates and retrieves an Event with org FK", async () => {
    const em = orm.em.fork();
    // Seed a user (org was pre-seeded in Phase 2 and is already in the DB)
    em.create(User, {
      id: TEST_USER_ID,
      email: "admin@local",
      role: "owner",
      orgId: WELL_KNOWN_ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await em.flush();

    const em2 = orm.em.fork();
    const orgRef = em2.getReference(Org, WELL_KNOWN_ORG_ID);
    em2.create(Event, {
      org: orgRef,
      verb: "task.created",
      subjectKind: "task",
      subjectId: "task-001",
      payload: { title: "First task" },
      createdAt: new Date(),
    });
    await em2.flush();

    const em3 = orm.em.fork();
    const found = await em3
      .getRepository(Event)
      .findOne({ verb: "task.created" });
    expect(found).toBeDefined();
    expect(found!.verb).toBe("task.created");
  });

  it("creates an Event without user (nullable FK)", async () => {
    const em = orm.em.fork();
    const orgRef = em.getReference(Org, WELL_KNOWN_ORG_ID);
    em.create(Event, {
      org: orgRef,
      verb: "system.init",
      subjectKind: "system",
      createdAt: new Date(),
    });
    await em.flush();

    const em2 = orm.em.fork();
    const found = await em2
      .getRepository(Event)
      .findOne({ verb: "system.init" });
    expect(found).toBeDefined();
    expect(found!.user == null).toBe(true);
  });
});

// ──────────────────────────────────────────────
// 5. Post-migrator invariant: no null-org events
// ──────────────────────────────────────────────

describe("Post-migrator invariant — eventRepo.count({ org: null }) === 0", () => {
  it("no events with org = null after migration ran", async () => {
    const em = orm.em.fork();
    const count = await em
      .getRepository(Event)
      .count({ org: null as unknown as Org });
    expect(count).toBe(0);
  });
});

// ──────────────────────────────────────────────
// 6. Repository class definitions
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

// ──────────────────────────────────────────────
// PHASE C — EXPLAIN: org-predicated query uses composite index
// ──────────────────────────────────────────────
// Note on PGlite EXPLAIN limitations:
//   PGlite's query planner for small tables may choose Seq Scan even when
//   composite indexes exist. The Postgres-identical "Index Scan" assertion is
//   brittle in PGlite. Fallback strategy:
//     (a) Assert EXPLAIN runs and returns a non-empty plan (proves query compiles).
//     (b) Assert composite index metadata exists in em.getMetadata().get(Event).indexes
//         (proves ORM metadata reflects the correct index definitions).
//     (c) Assert QueryBuilder SQL emits ORDER BY ... created_at DESC.
// ──────────────────────────────────────────────

describe("PHASE C — EXPLAIN: eventRepo.find({ org }, orderBy createdAt desc)", () => {
  it("EXPLAIN runs and returns a non-empty plan", async () => {
    const em = orm.em.fork();
    const repo = em.getRepository(Event);
    const qb = repo
      .createQueryBuilder("e")
      .select("*")
      .where({ org: WELL_KNOWN_ORG_ID })
      .orderBy({ createdAt: "desc" })
      .limit(50);

    const sql = qb.getQuery();
    const result = await em
      .getConnection()
      .execute(`explain ${sql}`, qb.getParams() as unknown[]);

    expect(result).toBeDefined();
    const rowCount = Array.isArray(result)
      ? result.length
      : Array.isArray((result as { rows?: unknown[] }).rows)
        ? (result as { rows: unknown[] }).rows.length
        : 0;
    expect(rowCount).toBeGreaterThan(0);
  });

  it("QueryBuilder SQL emits ORDER BY ... created_at DESC (index direction match)", () => {
    const em = orm.em.fork();
    const repo = em.getRepository(Event);
    const qb = repo
      .createQueryBuilder("e")
      .select("*")
      .where({ org: WELL_KNOWN_ORG_ID })
      .orderBy({ createdAt: "desc" })
      .limit(50);

    const sql = qb.getQuery();
    expect(sql.toLowerCase()).toMatch(/order by.*created_at.*desc/i);
  });

  it("ORM metadata has idx_events_org_created with DESC expression", () => {
    const meta = orm.getMetadata().get(Event);
    const idx = meta.indexes?.find((i) => i.name === "idx_events_org_created");
    expect(idx).toBeDefined();
    // expression form preserves DESC ordering that properties[] cannot encode
    expect(idx!.expression).toMatch(/created_at.*DESC/i);
  });

  it("ORM metadata has idx_events_subject with DESC expression", () => {
    const meta = orm.getMetadata().get(Event);
    const idx = meta.indexes?.find((i) => i.name === "idx_events_subject");
    expect(idx).toBeDefined();
    expect(idx!.expression).toMatch(/created_at.*DESC/i);
  });
});
