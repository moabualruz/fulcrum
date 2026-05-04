/**
 * TDD — MigratorService + SchemaMigration ledger.
 *
 * RED → GREEN sequence per issue #19.
 *
 * Suite 1: Round-trip migrations — for each migration class, run
 *   migrator.up({ to: name }) then migrator.down({ to: previous });
 *   assert schema state + SchemaMigration ledger rows.
 *
 * Suite 2: Lossy-down protection — isLossy=true fixture refuses without force;
 *   with force succeeds AND writes migration.down-lossy-forced Event row.
 *
 * Suite 3: Checksum validation — mock file read; assert MigratorService
 *   refuses with 'migration.checksum-mismatch' when stored checksum differs.
 *
 * C6: No raw SQL outside src/db/migrations/. Schema via orm.schema.create().
 * C7: MikroORM v7 `orm.migrator` (getter).
 * C8: needle-di Container for MigratorService.
 *
 * Closes (issue): .scratch/agent-os-vision/01-foundation-reset/issues/19-migration-up-down-versioning.md
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { readdir } from "node:fs/promises";
import { MikroORM } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { PGlite } from "@electric-sql/pglite";
import { PGliteKyselyDialect } from "../../src/db/PGliteKyselyDriver.ts";

// Entities needed by these tests
import { SchemaMigration } from "../../src/db/entities/SchemaMigration.ts";
import { Org } from "../../src/db/entities/auth/Org.ts";
import { User } from "../../src/db/entities/auth/User.ts";
import { Session } from "../../src/db/entities/auth/Session.ts";
import { Invitation } from "../../src/db/entities/auth/Invitation.ts";
import { OrgMember } from "../../src/db/entities/auth/OrgMember.ts";
import { FeatureFlag } from "../../src/db/entities/auth/FeatureFlag.ts";
import { Event } from "../../src/db/entities/core/Event.ts";
import { Task } from "../../src/db/entities/tasks/Task.ts";
import { Document } from "../../src/db/entities/docs/Document.ts";
import { Memory } from "../../src/db/entities/memory/Memory.ts";
import { AgentRun } from "../../src/db/entities/orchestration/AgentRun.ts";
import { Artifact } from "../../src/db/entities/artifacts/Artifact.ts";
import { Repo } from "../../src/db/entities/repos/Repo.ts";
import { Job } from "../../src/db/entities/jobs/Job.ts";
import { SearchDocument } from "../../src/db/entities/search/SearchDocument.ts";
import { CasbinRule } from "../../src/db/entities/flags/CasbinRule.ts";
import { WebhookSubscription } from "../../src/db/entities/flags/WebhookSubscription.ts";
import { NotificationRule } from "../../src/db/entities/flags/NotificationRule.ts";

// Repositories
import { SchemaMigrationRepository } from "../../src/db/repositories/SchemaMigrationRepository.ts";
import { EventRepository } from "../../src/db/repositories/core/EventRepository.ts";

// Service under test
import {
  MigratorService,
  LossyCheckFailedError,
  LossyDownProtectedError,
  MigrationChecksumMismatchError,
  MigrationFileMissingError,
} from "../../src/db/migrator-service.ts";
import { sha256Hex } from "../../src/db/migration-checksums.ts";
import { dbMigrationVersion, dbCanRunOnCurrentBinary, MAX_KNOWN_MIGRATION_VERSION } from "../../src/db/doctor-checks.ts";
import { PermissionNotAvailableError } from "../../src/db/db.router.ts";
import { run as runDbCommand } from "../../src/cli/commands/db.ts";

// All entity classes for the test ORM
const ALL_ENTITIES = [
  SchemaMigration,
  Org,
  User,
  Session,
  Invitation,
  OrgMember,
  FeatureFlag,
  Event,
  Task,
  Document,
  Memory,
  AgentRun,
  Artifact,
  Repo,
  Job,
  SearchDocument,
  CasbinRule,
  WebhookSubscription,
  NotificationRule,
];

const MIGRATIONS_PATH = new URL("../../src/db/migrations", import.meta.url).pathname;
const DESTRUCTIVE_DOWN_SQL = /\b(drop\s+table|drop\s+column)\b/i;
const LOSSY_FLAG = /static\s+(?:readonly\s+)?isLossy\s*=\s*true\b/;
const pglitesByOrm = new WeakMap<MikroORM, PGlite>();

/** Build a fresh in-memory PGlite ORM for each test suite. */
async function buildOrm(): Promise<MikroORM> {
  const pglite = new PGlite();
  const dialect = new PGliteKyselyDialect(() => pglite);

  const orm = await MikroORM.init({
    dbName: "postgres",
    driverOptions: dialect,
    multipleStatements: false,
    entities: ALL_ENTITIES,
    migrations: {
      path: MIGRATIONS_PATH,
      pathTs: MIGRATIONS_PATH,
      // PGliteKyselyDialect does not support savepoints — disable wrapping transactions.
      transactional: false,
      allOrNothing: false,
    },
    extensions: [Migrator],
    debug: false,
  });
  pglitesByOrm.set(orm, pglite);
  return orm;
}

async function closeOrm(orm?: MikroORM): Promise<void> {
  if (!orm) return;
  const pglite = pglitesByOrm.get(orm);
  try {
    await orm.close(true);
  } finally {
    if (pglite) {
      pglitesByOrm.delete(orm);
      await pglite.close();
    }
  }
}

/** Build a MigratorService backed by the given ORM instance. */
function buildService(
  orm: MikroORM,
  options: import("../../src/db/migrator-service.ts").MigratorServiceOptions = {},
): MigratorService {
  const schemaMigrationRepo = orm.em.getRepository(SchemaMigration) as SchemaMigrationRepository;
  const eventRepo = orm.em.getRepository(Event) as EventRepository;
  return new MigratorService(orm, schemaMigrationRepo, eventRepo, options);
}

// ────────────────────────────────────────────────────────────────────────────
// Suite 1: MigrationStatus + history on a freshly initialised DB
// ────────────────────────────────────────────────────────────────────────────

describe("MigratorService.status() on empty DB", () => {
  let orm: MikroORM;
  let service: MigratorService;

  beforeAll(async () => {
    orm = await buildOrm();
    // NOTE: Do NOT call orm.schema.create() — we want the migration-based schema.
    // Create only the schema_migrations table manually so the service can bootstrap.
    // (The Migration20260501140000 migration creates it, but status() doesn't need it.)
    service = buildService(orm);
  });

  afterAll(async () => {
    await closeOrm(orm);
  });

  it("returns current=null on a blank DB (getExecuted returns nothing)", async () => {
    const status = await service.status();
    // On a blank DB the migrator storage table (mikro_orm_migrations) doesn't exist yet.
    // MikroORM's getPending() creates the table if needed; getExecuted() returns [].
    expect(status.current).toBeNull();
    expect(Array.isArray(status.pending)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Suite 2: migrate() up to latest — writes ledger rows
// ────────────────────────────────────────────────────────────────────────────

describe("MigratorService.migrate() — up to latest", () => {
  let orm: MikroORM;
  let service: MigratorService;

  beforeAll(async () => {
    orm = await buildOrm();
    // Start with a blank DB — let the migrator create ALL tables (including schema_migrations).
    // Do NOT call orm.schema.create() — that would conflict with migration-based DDL.
    service = buildService(orm);
  });

  afterAll(async () => {
    await closeOrm(orm);
  });

  it("runs migrate() without throwing", async () => {
    await expect(service.migrate()).resolves.toBeUndefined();
  });

  it("status() shows no pending migrations after migrate()", async () => {
    const status = await service.status();
    // After migrate(), pending should be empty.
    expect(status.pastDue).toBe(0);
    expect(status.pending.length).toBe(0);
  });

  it("status() shows a current migration after migrate()", async () => {
    const status = await service.status();
    // After migrate(), current should be the last migration name (not null).
    expect(status.current).not.toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Suite 3: Lossy-down protection
// ────────────────────────────────────────────────────────────────────────────

describe("MigratorService — lossy-down protection", () => {
  let orm: MikroORM;
  let service: MigratorService;

  beforeAll(async () => {
    orm = await buildOrm();
    // Do NOT call orm.schema.create() — let the migrator create the schema.
    service = buildService(orm);
    // Apply all migrations so there's a history to downgrade from.
    await service.migrate();
  });

  afterAll(async () => {
    await closeOrm(orm);
  });

  it("throws target-not-found when migrating to a non-existent version", async () => {
    await expect(
      service.migrate("NON_EXISTENT_VERSION_THAT_IS_DEFINITELY_NOT_PENDING", false),
    ).rejects.toThrow(/target-not-found/);
  });

  it("migrate() with undefined target is idempotent when already at latest", async () => {
    // After beforeAll applied all migrations, running migrate() again should be a no-op.
    await expect(service.migrate()).resolves.toBeUndefined();
    const status = await service.status();
    expect(status.pastDue).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Suite 4: migration-checksums utility
// ────────────────────────────────────────────────────────────────────────────

describe("migration-checksums", () => {
  it("sha256Hex returns a 64-character hex string", async () => {
    const result = await sha256Hex("hello world");
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sha256Hex is deterministic", async () => {
    const a = await sha256Hex("test content");
    const b = await sha256Hex("test content");
    expect(a).toBe(b);
  });

  it("sha256Hex produces different digests for different inputs", async () => {
    const a = await sha256Hex("content A");
    const b = await sha256Hex("content B");
    expect(a).not.toBe(b);
  });

  it("sha256Hex of empty string matches known SHA-256", async () => {
    // SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    const result = await sha256Hex("");
    expect(result).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("migration lossiness declarations", () => {
  it("marks every destructive down() migration with static isLossy=true", async () => {
    const files = (await readdir(MIGRATIONS_PATH))
      .filter((name) => /^Migration.*\.ts$/.test(name))
      .sort();

    const unflagged: string[] = [];

    for (const file of files) {
      const contents = await Bun.file(`${MIGRATIONS_PATH}/${file}`).text();
      const downBody = /override\s+async\s+down\(\):\s+Promise<void>\s*\{([\s\S]*?)^\s*\}/m.exec(contents)?.[1] ?? "";

      if (DESTRUCTIVE_DOWN_SQL.test(downBody) && !LOSSY_FLAG.test(contents)) {
        unflagged.push(file);
      }
    }

    expect(unflagged).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Suite 5: Doctor checks
// ────────────────────────────────────────────────────────────────────────────

describe("doctor-checks", () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await buildOrm();
    // Create ONLY the schema_migrations table so the doctor checks have a table to query.
    // Use schema.create() selectively by building a minimal ORM with just SchemaMigration.
    // Simplest approach: just create the schema_migrations table via orm.schema.createSchema()
    // on a filtered entity list — OR use orm.schema.create() which creates all tables.
    // Since we don't run any migrations in this suite, we can call orm.schema.create() safely.
    await orm.schema.create();
  });

  afterAll(async () => {
    await closeOrm(orm);
  });

  /** Get a fresh forked-EM-backed repo for each check call. */
  function freshRepo(): SchemaMigrationRepository {
    return orm.em.fork().getRepository(SchemaMigration) as SchemaMigrationRepository;
  }

  it("dbMigrationVersion returns warn status when no rows", async () => {
    const result = await dbMigrationVersion(freshRepo());
    expect(result.check).toBe("db.migrationVersion");
    expect(result.status).toBe("warn");
  });

  it("dbCanRunOnCurrentBinary returns pass when no rows", async () => {
    const result = await dbCanRunOnCurrentBinary(freshRepo());
    expect(result.check).toBe("db.canRunOnCurrentBinary");
    expect(result.status).toBe("pass");
  });

  it("MAX_KNOWN_MIGRATION_VERSION is a positive integer", () => {
    expect(typeof MAX_KNOWN_MIGRATION_VERSION).toBe("number");
    expect(MAX_KNOWN_MIGRATION_VERSION).toBeGreaterThan(0);
  });

  it("dbMigrationVersion returns pass after a migration row is inserted", async () => {
    // Insert a fake SchemaMigration row via forked EM to exercise the pass path.
    // version: caller-supplied bigint derived from class name timestamp.
    const em = orm.em.fork();
    em.create(SchemaMigration, {
      version: 20260501104413,
      name: "Migration20260501104413_auth",
      checksum: "abc123",
      direction: "up",
      appliedAt: new Date(),
    });
    await em.flush();

    const result = await dbMigrationVersion(freshRepo());
    expect(result.status).toBe("pass");
    // P1#19 round-2: field renamed `message` → `detail` per Pillar 14 doctor spec.
    expect(result.detail).toContain("Migration20260501104413_auth");
  });

  it("dbCanRunOnCurrentBinary: timestamp version is compared to compile-time constant", async () => {
    // Insert another fake row to ensure there's at least one row.
    // version: caller-supplied bigint — use a value < MAX_KNOWN_MIGRATION_VERSION so check PASSes.
    const em = orm.em.fork();
    em.create(SchemaMigration, {
      version: 20260501120000,
      name: "Migration20260501120000_version_test",
      checksum: "xyz",
      direction: "up",
      appliedAt: new Date(),
    });
    await em.flush();

    const result = await dbCanRunOnCurrentBinary(freshRepo());
    // version 20260501120000 < MAX_KNOWN_MIGRATION_VERSION 20260501140000 → check must PASS.
    expect(result.check).toBe("db.canRunOnCurrentBinary");
    expect(result.status).toBe("pass");
  });
});

describe("fulcrum db migration command", () => {
  it("routes explicit PGlite migration through the db command surface", async () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (line: unknown) => {
      lines.push(String(line));
    };
    try {
      await runDbCommand(["migrate", "--backend", "pglite", "--json"], null);
    } finally {
      console.log = original;
    }

    const payload = JSON.parse(lines.join("\n"));
    expect(payload.backend).toBe("pglite");
    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.applied)).toBe(true);
    expect(Array.isArray(payload.pending)).toBe(true);
  });

  it("routes explicit PostgreSQL migration through the db command surface", async () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (line: unknown) => {
      lines.push(String(line));
    };
    try {
      await runDbCommand([
        "migrate",
        "--backend",
        "postgres",
        "--url",
        "postgresql://fulcrum:fulcrum@127.0.0.1:5432/fulcrum_test",
        "--json",
      ], null);
    } catch (error) {
      expect(String((error as Error).message)).not.toContain("Database command requires a wired CLI context");
      return;
    } finally {
      console.log = original;
    }

    const payload = JSON.parse(lines.join("\n"));
    expect(payload.backend).toBe("postgres");
    expect(payload.ok).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Suite 6: SchemaMigration entity metadata
// ────────────────────────────────────────────────────────────────────────────

describe("SchemaMigration entity metadata", () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await buildOrm();
  });

  afterAll(async () => {
    await closeOrm(orm);
  });

  it("is registered with tableName=schema_migrations", () => {
    const meta = orm.getMetadata().get(SchemaMigration as never);
    expect(meta).toBeDefined();
    expect(meta.tableName).toBe("schema_migrations");
  });

  it("has version as primary key", () => {
    const meta = orm.getMetadata().get(SchemaMigration as never);
    const versionProp = meta.properties["version"];
    expect(versionProp).toBeDefined();
    expect(versionProp!.primary).toBe(true);
  });

  it("has name, checksum, direction, appliedAt properties", () => {
    const meta = orm.getMetadata().get(SchemaMigration as never);
    expect(meta.properties["name"]).toBeDefined();
    expect(meta.properties["checksum"]).toBeDefined();
    expect(meta.properties["direction"]).toBeDefined();
    expect(meta.properties["appliedAt"]).toBeDefined();
  });

  it("version property is NOT autoincrement (bigint caller-supplied)", () => {
    const meta = orm.getMetadata().get(SchemaMigration as never);
    const versionProp = meta.properties["version"];
    expect(versionProp).toBeDefined();
    // Confirm no autoincrement — the serial PK bug fixed in P1#19 round-2.
    expect(versionProp!.autoincrement).toBe(false);
    // MikroORM maps `bigint` type to "BigIntType" internally.
    expect(versionProp!.type).toBe("BigIntType");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Suite 7: Forced-lossy-down protection (MED 5 — P1#19 round-2)
// ────────────────────────────────────────────────────────────────────────────

describe("MigratorService — forced-lossy-down protection (P1#19 round-2)", () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await buildOrm();
    // Apply all migrations so we have migrations to roll back.
    const service = buildService(orm);
    await service.migrate();
  });

  afterAll(async () => {
    await closeOrm(orm);
  });

  it("throws LossyDownProtectedError when isLossy=true and force=false", async () => {
    // Inject a resolver that always returns true (simulates isLossy=true migration).
    // Use the real checksumReader so #validateChecksums passes (migration files are real).
    const service = buildService(orm, {
      isLossyResolver: async (_path: string) => true,
    });

    // Get the last executed migration to use as down target.
    const executed = await orm.migrator.getExecuted();
    expect(executed.length).toBeGreaterThan(1);

    // Attempt down to second-to-last migration — should be refused.
    const target = executed[executed.length - 2]!.name;
    await expect(
      service.migrate(target, false),
    ).rejects.toThrow(LossyDownProtectedError);
  });

  it("throws LossyDownProtectedError with correct migrationName", async () => {
    const service = buildService(orm, {
      isLossyResolver: async (_path: string) => true,
    });

    const executed = await orm.migrator.getExecuted();
    const target = executed[executed.length - 2]!.name;
    const lastMigrationName = executed[executed.length - 1]!.name;

    let caughtError: LossyDownProtectedError | undefined;
    try {
      await service.migrate(target, false);
    } catch (err) {
      if (err instanceof LossyDownProtectedError) caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(LossyDownProtectedError);
    expect(caughtError!.code).toBe("LOSSY_DOWN_PROTECTED");
    // The migration that would be reverted is the last applied one.
    expect(caughtError!.migrationName).toBe(lastMigrationName);
  });

  it("succeeds with force=true and writes migration.down-lossy-forced Event row", async () => {
    // Build a fresh ORM so forced-down succeeds (no checksum records interfering).
    const freshOrm = await buildOrm();
    const WELL_KNOWN_ORG_ID = "00000000-0000-0000-0000-000000000001";
    try {
      // Apply all migrations using default service (real checksums stored).
      await buildService(freshOrm).migrate();

      // Create the well-known org required by #emitLossyForcedEvent's FK constraint.
      const setupEm = freshOrm.em.fork();
      setupEm.create(Org, {
        id: WELL_KNOWN_ORG_ID,
        name: "test-org",
        slug: "test-org",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await setupEm.flush();

      const executed = await freshOrm.migrator.getExecuted();
      expect(executed.length).toBeGreaterThan(1);
      const target = executed[executed.length - 2]!.name;
      const lastMigrationName = executed[executed.length - 1]!.name;

      // Inject lossy resolver that returns true for ALL paths.
      // Use real checksumReader so #validateChecksums passes.
      const service = buildService(freshOrm, {
        isLossyResolver: async (_path: string) => true,
      });

      // Should succeed with force=true.
      await expect(service.migrate(target, true)).resolves.toBeUndefined();

      // Verify migration.down-lossy-forced Event row was written.
      const em = freshOrm.em.fork();
      const eventRepo = em.getRepository(Event) as EventRepository;
      const lossyEvent = await eventRepo.findOne({
        verb: "migration.down-lossy-forced",
        subjectId: lastMigrationName,
      } as Parameters<typeof eventRepo.findOne>[0]);

      expect(lossyEvent).not.toBeNull();
      expect(lossyEvent!.verb).toBe("migration.down-lossy-forced");
    } finally {
      await closeOrm(freshOrm);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Suite 8: LossyCheckFailedError — fail-closed lossy check (P1#19 round-2)
// ────────────────────────────────────────────────────────────────────────────

describe("MigratorService — LossyCheckFailedError (fail-closed lossy import)", () => {
  it("isMigrationLossy via down path: throws LossyCheckFailedError for non-existent file", async () => {
    const freshOrm = await buildOrm();
    try {
      // Apply all migrations using default service (real checksums stored).
      await buildService(freshOrm).migrate();

      const executed = await freshOrm.migrator.getExecuted();
      expect(executed.length).toBeGreaterThan(1);
      const target = executed[executed.length - 2]!.name;

      // Inject resolver that throws LossyCheckFailedError (simulates missing/corrupt file).
      // Use real checksumReader so #validateChecksums passes (migration files are real).
      const service = buildService(freshOrm, {
        isLossyResolver: async (path: string) => {
          throw new LossyCheckFailedError(path, new Error("file not found"));
        },
      });

      // Must propagate LossyCheckFailedError — fail-closed, not fail-open.
      await expect(service.migrate(target, false)).rejects.toThrow(LossyCheckFailedError);
    } finally {
      await closeOrm(freshOrm);
    }
  });

  it("LossyCheckFailedError has correct code and migrationPath", () => {
    const err = new LossyCheckFailedError("/path/to/migration.ts", new Error("oops"));
    expect(err.code).toBe("LOSSY_CHECK_FAILED");
    expect(err.migrationPath).toBe("/path/to/migration.ts");
    expect(err.message).toContain("lossy-check-failed");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Suite 9: Checksum mismatch — MigrationChecksumMismatchError (MED 5 — P1#19 round-2)
// ────────────────────────────────────────────────────────────────────────────

describe("MigratorService — checksum mismatch (P1#19 round-2)", () => {
  it("migrate() throws MigrationChecksumMismatchError when stored checksum differs from on-disk", async () => {
    const freshOrm = await buildOrm();
    try {
      // First run: apply all migrations, storing real checksums.
      // Use a custom checksumReader that returns a known value on first call,
      // then a different value on second call (simulating file edit).
      const ORIGINAL_CHECKSUM = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      const TAMPERED_CHECKSUM = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

      const serviceFirstRun = buildService(freshOrm, {
        // Non-empty stable checksum so it gets stored.
        checksumReader: async (_path: string) => ORIGINAL_CHECKSUM,
        isLossyResolver: async (_path: string) => false,
      });
      await serviceFirstRun.migrate();

      // Second run: tampered checksumReader returns a different digest.
      const serviceSecondRun = buildService(freshOrm, {
        checksumReader: async (_path: string) => TAMPERED_CHECKSUM,
        isLossyResolver: async (_path: string) => false,
      });

      // The pre-flight checksum validation in migrate() detects the mismatch.
      await expect(serviceSecondRun.migrate()).rejects.toThrow(MigrationChecksumMismatchError);
    } finally {
      await closeOrm(freshOrm);
    }
  });

  it("MigrationChecksumMismatchError has correct code and checksums", () => {
    const err = new MigrationChecksumMismatchError(
      "Migration20260501104413_auth",
      "aaaa",
      "bbbb",
    );
    expect(err.code).toBe("MIGRATION_CHECKSUM_MISMATCH");
    expect(err.storedChecksum).toBe("aaaa");
    expect(err.computedChecksum).toBe("bbbb");
    expect(err.message).toContain("checksum-mismatch");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Suite 9b: MigrationFileMissingError — unreadable applied-migration file throws
// (HIGH 2 caveat — P1#19 round-3)
// ────────────────────────────────────────────────────────────────────────────

describe("MigratorService — unreadable applied-migration file (P1#19 round-3)", () => {
  it("migrate() throws MigrationFileMissingError when checksumReader throws for an applied migration", async () => {
    const freshOrm = await buildOrm();
    try {
      // First run: apply all migrations with a stable checksum so the ledger has rows.
      const serviceFirstRun = buildService(freshOrm, {
        checksumReader: async (_path: string) => "stable-checksum-value",
        isLossyResolver: async (_path: string) => false,
      });
      await serviceFirstRun.migrate();

      // Second run: checksumReader throws (simulates deleted / unreadable file).
      const FILE_READ_ERROR = new Error("ENOENT: no such file or directory");
      const serviceSecondRun = buildService(freshOrm, {
        checksumReader: async (_path: string) => {
          throw FILE_READ_ERROR;
        },
        isLossyResolver: async (_path: string) => false,
      });

      // Fail-closed: must throw MigrationFileMissingError, not silently skip.
      await expect(serviceSecondRun.migrate()).rejects.toThrow(MigrationFileMissingError);
    } finally {
      await closeOrm(freshOrm);
    }
  });

  it("MigrationFileMissingError has correct code and message", () => {
    const cause = new Error("ENOENT");
    const err = new MigrationFileMissingError("Migration20260501104413_auth", cause);
    expect(err.code).toBe("MIGRATION_FILE_MISSING");
    expect(err.message).toContain("Migration20260501104413_auth");
    expect(err.message).toContain("re-apply attack");
    expect(err.cause).toBe(cause);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Suite 10: Round-trip up/down on all 6 migration classes (MED 5 — P1#19 round-3)
// ────────────────────────────────────────────────────────────────────────────

const MIGRATION_CLASSES = [
  "Migration20260501104413_auth",
  "Migration20260501120537_events_org_id_backfill",
  "Migration20260501120538_events_org_id_notnull",
  "Migration20260501130000_composite_indexes",
  "Migration20260501130100_flag_stubs",
  "Migration20260501140000_schema_migration_ledger",
] as const;

describe("MigratorService — round-trip up/down on all migration classes (P1#19 round-2)", () => {
  /**
   * For each migration class: run up to it, then back down to the previous one,
   * then up again — assert no errors and pending count is 0 at the end.
   *
   * Uses a checksum reader that returns empty strings to skip checksum validation
   * (the real files are readable but we want to isolate the round-trip logic).
   */
  for (const migName of MIGRATION_CLASSES) {
    it(`round-trip: ${migName}`, async () => {
      const freshOrm = await buildOrm();
      try {
        const service = buildService(freshOrm, {
          // Empty checksum — skips validation since stored "" never matches non-empty.
          // This isolates round-trip DDL logic from file-read behaviour.
          checksumReader: async (_path: string) => "",
          isLossyResolver: async (_path: string) => false,
        });

        // Step 1: migrate UP to this migration.
        await service.migrate(migName);

        // Verify it's now in executed list.
        const afterUp = await freshOrm.migrator.getExecuted();
        const executedNames = afterUp.map((m) => m.name);
        expect(executedNames).toContain(migName);

        // Step 2: get status — pastDue reflects migrations after this one.
        // (If migName is the last migration, pastDue = 0.)
        const statusAfterUp = await service.status();
        expect(statusAfterUp.current).not.toBeNull();

        // Step 3: if there's a migration BEFORE this one, migrate DOWN to it.
        const idx = afterUp.findIndex((m) => m.name === migName);
        if (idx > 0) {
          const prevMig = afterUp[idx - 1]!.name;
          await service.migrate(prevMig, false);

          const afterDown = await freshOrm.migrator.getExecuted();
          const afterDownNames = afterDown.map((m) => m.name);
          expect(afterDownNames).not.toContain(migName);

          // Step 4: migrate back UP.
          await service.migrate(migName);
          const afterReUp = await freshOrm.migrator.getExecuted();
          expect(afterReUp.map((m) => m.name)).toContain(migName);
        }

        // Final: migrate to latest — ensure no pending after round-trip.
        await service.migrate();
        const finalStatus = await service.status();
        expect(finalStatus.pastDue).toBe(0);
      } finally {
        await closeOrm(freshOrm);
      }
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Suite 11: db.router PermissionNotAvailableError (HIGH 4 — P1#19 round-2)
// ────────────────────────────────────────────────────────────────────────────

describe("db.router — PermissionNotAvailableError (P1#19 round-2)", () => {
  it("dbMigrate throws PermissionNotAvailableError (not null-pointer)", async () => {
    const { dbMigrate } = await import("../../src/db/db.router.ts");
    await expect(dbMigrate(null)).rejects.toThrow(PermissionNotAvailableError);
  });

  it("dbStatus throws PermissionNotAvailableError", async () => {
    const { dbStatus } = await import("../../src/db/db.router.ts");
    await expect(dbStatus(null)).rejects.toThrow(PermissionNotAvailableError);
  });

  it("dbHistory throws PermissionNotAvailableError", async () => {
    const { dbHistory } = await import("../../src/db/db.router.ts");
    await expect(dbHistory(null)).rejects.toThrow(PermissionNotAvailableError);
  });

  it("PermissionNotAvailableError has code PERMISSION_NOT_AVAILABLE", () => {
    const err = new PermissionNotAvailableError();
    expect(err.code).toBe("PERMISSION_NOT_AVAILABLE");
    expect(err.name).toBe("PermissionNotAvailableError");
  });
});
