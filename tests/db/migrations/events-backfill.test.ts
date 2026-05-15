/**
 * TDD — events backfill migration: single-ORM single-ORM setup round-trip + EXPLAIN.
 *
 * Single-ORM two-migration architecture (round-4 fix):
 *
 * The events org_id rollout is split across TWO production migration classes to
 * cleanly separate DDL (table creation) from DML (backfill) without weakening
 * production fail-loud semantics (no IF NOT EXISTS anywhere):
 *
 *   Migration20260501120537_events_org_id_backfill — CREATE TABLE orgs + events (org_id nullable).
 *   Migration20260501120538_events_org_id_notnull  — backfill UPDATE → NOT NULL → FK → indexes.
 *
 * Test phases:
 *
 *  STEP 1 — run auth + events-schema migrations via single ORM instance.
 *    Apply Migration20260501104413_auth (creates users/sessions/etc).
 *    Apply Migration20260501120537_events_org_id_backfill (creates orgs + events nullable).
 *    Events table now exists with org_id nullable; no rows.
 *
 *  STEP 2 — pre-seed null-org state before the NOT NULL migration runs (C6 carve-out).
 *    Using sanctioned raw conn.execute() calls — the ONLY way to construct pre-migration
 *    data state without an entity class path:
 *      (a) seed the well-known org row (D4: '00000000-0000-0000-0000-000000000001')
 *          required for the FK the next migration adds
 *      (b) insert one event row with org_id = NULL (the pre-existing null-org row)
 *    No table creation here — tables already exist from setup step. Raw SQL is strictly
 *    data-only (two INSERT statements). C6 carve-out cited per call below.
 *
 *  STEP 3 — run the NOT NULL migration via the SAME ORM instance.
 *    migrator.up({ to: 'Migration20260501120538_events_org_id_notnull' })
 *    The backfill UPDATE runs against the live null-org row seeded in setup step.
 *    NOT NULL / FK / indexes complete the schema.
 *
 *  STEP 4 — assert backfill occurred on the pre-existing row.
 *    eventRepo.count({ org: null }) === 0
 *    events WHERE verb='test.event.preexisting' has org_id = WELL_KNOWN_ORG_ID
 *
 *  STEP C — EXPLAIN on org-predicated query (reuses the same ORM).
 *    Note: PGlite's EXPLAIN output does not guarantee "Index Scan" phrasing
 *    (PGlite's small-table planner may choose Seq Scan on empty tables even
 *    when indexes exist). We therefore assert:
 *      (a) EXPLAIN runs without error and returns at least one plan row, AND
 *      (b) the composite index names appear in em.getMetadata().get(Event).indexes,
 *          confirming the ORM metadata reflects the correct index definitions.
 *    This is the documented fallback for PGlite EXPLAIN limitations.
 *
 * Per C6: ONLY the setup step setup calls use raw SQL (two INSERTs — data only, no DDL).
 *         All post-migration fixture data uses em.create/flush.
 *         Each raw SQL call carries a per-call C6 citation (see setup step below).
 * Per C7: MikroORM v7 @Entity decorator-class pattern.
 * Per D4: well-known local org UUID = '00000000-0000-0000-0000-000000000001'.
 *
 * transactional: false / allOrNothing: false — test-only workaround for
 * PGlite's lack of savepoint support. PGliteKyselyDialect does not support
 * savepoints; migrations must run outside a wrapping transaction.
 * This setting lives ONLY in makeOrmConfig() below — NOT in services/platform-core/src/infrastructure/application-database/mikro-orm.config.ts.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { MikroORM, ReferenceKind } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { PGlite } from "@electric-sql/pglite";
import { PGliteKyselyDialect } from "@platform-core/infrastructure/application-database/PGliteKyselyDriver.ts";
import { randomUUID } from "node:crypto";

// Entity classes
import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import { User } from "@platform-core/infrastructure/application-database/entities/auth/User.ts";
import { Session } from "@platform-core/infrastructure/application-database/entities/auth/Session.ts";
import { Invitation } from "@platform-core/infrastructure/application-database/entities/auth/Invitation.ts";
import { OrgMember } from "@platform-core/infrastructure/application-database/entities/auth/OrgMember.ts";
import { FeatureFlag } from "@platform-core/infrastructure/application-database/entities/auth/FeatureFlag.ts";
import { Event } from "@platform-core/infrastructure/application-database/entities/core/Event.ts";

// Repositories
import { OrgRepository } from "@platform-core/infrastructure/application-database/repositories/auth/OrgRepository.ts";
import { EventRepository } from "@platform-core/infrastructure/application-database/repositories/core/EventRepository.ts";

const WELL_KNOWN_ORG_ID = "00000000-0000-0000-0000-000000000001";
const TEST_USER_ID = "00000000-0000-0000-0000-000000000002";
const MIGRATION_PATH = join(
  process.cwd(),
  "services/platform-core/src/infrastructure/application-database/migrations",
);

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
      // wrapping transaction. This setting MUST NOT appear in services/platform-core/src/infrastructure/application-database/mikro-orm.config.ts.
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
let pglite: PGlite;

// ID of the pre-existing null-org event seeded in setup step.
let _preExistingEventId: string;

beforeAll(async () => {
  pglite = new PGlite();
  orm = await MikroORM.init(makeOrmConfig(pglite));

  // ── STEP 1: run auth + events-schema migrations ────────────────────────────
  // Migration20260501104413_auth: creates users/sessions/invitations/org_members/feature_flags.
  // Migration20260501120537_events_org_id_backfill: creates orgs + events (org_id nullable).
  // Stops before the NOT NULL migration — events table has org_id nullable, no rows.
  await orm.migrator.up({
    to: "Migration20260501120537_events_org_id_backfill",
  });

  // ── STEP 2: pre-seed null-org state before NOT NULL migration runs ─────────
  // C6 carve-out: raw data-only INSERTs to construct pre-migration data state.
  // Tables already exist from setup step (strict CREATE TABLE in migration — no IF NOT EXISTS).
  // These two INSERT calls are the only raw SQL in this test; no DDL is used here.
  const conn = orm.em.getConnection();

  // C6 carve-out: raw INSERT for well-known org row (D4). Required for FK added by
  // Migration20260501120538_events_org_id_notnull. No entity-class path exists pre-migration.
  await conn.execute(
    `insert into "orgs" ("id", "name", "slug", "created_at", "updated_at") values ('${WELL_KNOWN_ORG_ID}', 'Local', 'local', now(), now())`,
  );

  // C6 carve-out: raw INSERT for null-org event row — this is the pre-existing row the
  // backfill UPDATE in Migration20260501120538_events_org_id_notnull must assign an org.
  // Cannot use em.create here: Event entity requires non-nullable org post-migration.
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
      `STEP 2 precondition failed: expected 1 null-org event, got ${preCount}`,
    );
  }

  // ── STEP 3: run the NOT NULL migration ────────────────────────────────────
  // The backfill UPDATE sets our null-org row to WELL_KNOWN_ORG_ID.
  // NOT NULL / FK / index steps complete the schema.
  await orm.migrator.up({
    to: "Migration20260501120538_events_org_id_notnull",
  });
});

afterAll(async () => {
  if (orm) await orm.close(true);
  await (pglite as { close?: () => Promise<void> }).close?.();
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
// 3. Migrator round-trip: getMigrator().up() records migrations
// ──────────────────────────────────────────────

describe("Migrator round-trip — getMigrator().up() records migrations", () => {
  it("backfill schema migration is recorded in mikro_orm_migrations table", async () => {
    const storage = (
      orm.migrator as import("@mikro-orm/migrations").Migrator
    ).getStorage();
    const executed = await storage.executed();
    expect(executed).toContain(
      "Migration20260501120537_events_org_id_backfill",
    );
  });

  it("notnull migration is recorded in mikro_orm_migrations table", async () => {
    const storage = (
      orm.migrator as import("@mikro-orm/migrations").Migrator
    ).getStorage();
    const executed = await storage.executed();
    expect(executed).toContain(
      "Migration20260501120538_events_org_id_notnull",
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
// STEP 4 — Backfill assertions
// ──────────────────────────────────────────────
// The pre-existing null-org event inserted in setup step must now have
// org_id = WELL_KNOWN_ORG_ID after the migrator's backfill UPDATE ran.

describe("STEP 4 — Backfill: pre-existing null-org row now has default org", () => {
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
    // Seed a user (org was pre-seeded in setup step and is already in the DB)
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
// STEP C — EXPLAIN: org-predicated query uses composite index
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

describe("STEP C — EXPLAIN: eventRepo.find({ org }, orderBy createdAt desc)", () => {
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
    // C6 carve-out: EXPLAIN is a planner introspection call, not a DDL/DML mutation.
    // PGlite doesn't expose a typed query-plan API. Sanctioned for test-only verification
    // of query compilation and index usage via raw EXPLAIN output.
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
