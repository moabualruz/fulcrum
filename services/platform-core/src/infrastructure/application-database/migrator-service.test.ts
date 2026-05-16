/**
 * MigratorService + SchemaMigration ledger — TypeORM DataSource version.
 *
 * Rewritten from MikroORM after migration (Task 9).
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { DataSource, type DataSourceOptions, Repository } from "typeorm";
import { PGlite } from "@electric-sql/pglite";
import { EventEmitter } from "events";

import { createDataSourceOptions } from "@platform-core/infrastructure/application-database/typeorm.config.ts";
import { SchemaMigration } from "@platform-core/infrastructure/application-database/entities/SchemaMigration.ts";
import {
  MigratorService,
  LossyCheckFailedError,
  LossyDownProtectedError,
  MigrationChecksumMismatchError,
  MigrationFileMissingError,
} from "@platform-core/infrastructure/application-database/migrator-service.ts";
import { sha256Hex } from "@platform-core/infrastructure/application-database/migration-checksums.ts";
import { dbMigrationVersion, dbCanRunOnCurrentBinary, MAX_KNOWN_MIGRATION_VERSION } from "@platform-core/infrastructure/application-database/doctor-checks.ts";
import { PermissionNotAvailableError } from "@platform-core/infrastructure/application-database/db.router.ts";
import { run as runDbCommand } from "@fulcrum/cli/commands/db.ts";

const MIGRATIONS_PATH = join(process.cwd(), "services/platform-core/src/infrastructure/application-database/migrations");
const DESTRUCTIVE_DOWN_SQL = /\b(drop\s+table|drop\s+column)\b/i;
const LOSSY_FLAG = /static\s+(?:readonly\s+)?isLossy\s*=\s*true\b/;

/** Build an isolated in-memory PGlite driver (no shared singleton). */
function buildIsolatedPgDriver(): { driverClass: unknown; close: () => Promise<void> } {
  let instance: PGlite | null = null;
  async function getInstance(): Promise<PGlite> {
    if (!instance) instance = await PGlite.create();
    return instance;
  }
  class IsolatedPool extends EventEmitter {
    doneCallback() {}
    async connect(callback: Function) {
      try { await getInstance(); callback(null, this, this.doneCallback); }
      catch (error) { callback(error, null, this.doneCallback); }
    }
    async query(sqlQuery: string, queryParameters?: unknown, callback?: Function) {
      const pg = await getInstance();
      let cb = callback, params = queryParameters as unknown[];
      if (typeof queryParameters === "function") { cb = queryParameters as Function; params = undefined as unknown as unknown[]; }
      const hasParams = params !== undefined && Array.isArray(params) && params.length > 0;
      let finalSql = sqlQuery;
      if (hasParams && sqlQuery.includes("?")) {
        let idx = 0;
        finalSql = sqlQuery.replace(/\?/g, () => `$${++idx}`);
      }
      const queryPromise = hasParams
        ? pg.query(finalSql, params as unknown[])
        : pg.exec(finalSql).then((r: unknown[]) => (r as Array<{ rows: unknown[] }>)[r.length - 1] || { rows: [] });
      return queryPromise
        .then((results: unknown) => { if (cb) cb(null, results); return results; })
        .catch((error: unknown) => { if (cb) cb(error, null); throw error; });
    }
    end(errorCallback: Function) {
      if (instance) {
        instance.close().then(() => { instance = null; errorCallback(null); }).catch((e: unknown) => errorCallback(e));
      } else { errorCallback(null); }
    }
  }
  return {
    driverClass: class { static Pool = IsolatedPool; },
    close: async () => { if (instance) { await instance.close(); instance = null; } },
  };
}

async function buildDs(): Promise<DataSource> {
  const { driverClass, close } = buildIsolatedPgDriver();
  const opts = createDataSourceOptions([], {});
  const ds = new DataSource({
    ...opts,
    driver: driverClass,
    logging: false,
    installExtensions: false,
  } as DataSourceOptions);
  // Store close fn so ds.destroy() also closes the isolated PGlite
  const origDestroy = ds.destroy.bind(ds);
  ds.destroy = async () => { await origDestroy(); await close(); };
  await ds.initialize();
  return ds;
}

async function buildService(
  ds: DataSource,
  options: import("@platform-core/infrastructure/application-database/migrator-service.ts").MigratorServiceOptions = {},
): Promise<MigratorService> {
  const schemaMigrationRepo = new (class {
    constructor(private readonly inner: Repository<SchemaMigration>) {}
  })(ds.getRepository(SchemaMigration)) as unknown as import("@platform-core/infrastructure/application-database/repositories/SchemaMigrationRepository.ts").SchemaMigrationRepository;
  const eventRepo = ds.getRepository(
    (await import("@platform-core/infrastructure/application-database/entities/core/Event.ts")).Event,
  ) as unknown as import("@platform-core/infrastructure/application-database/repositories/core/EventRepository.ts").EventRepository;
  return new MigratorService(ds, schemaMigrationRepo, eventRepo, options);
}

// ─────────────────────────────────────────────────────────────────

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

describe("MigratorService.status() on empty DB", () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = await buildDs();
  });

  afterAll(async () => {
    await ds.destroy();
  });

  it("returns current=null on a blank DB", async () => {
    const service = await buildServiceAsync(ds);
    const status = await service.status();
    expect(status.current).toBeNull();
    expect(Array.isArray(status.pending)).toBe(true);
  });
});

describe("MigratorService.migrate() — up to latest", () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = await buildDs();
  });

  afterAll(async () => {
    await ds.destroy();
  });

  it("runs migrate() without throwing", async () => {
    const service = await buildServiceAsync(ds);
    await expect(service.migrate()).resolves.toBeUndefined();
  }, 20_000);

  it("status() shows no pending migrations after migrate()", async () => {
    const service = await buildServiceAsync(ds);
    const status = await service.status();
    expect(status.pastDue).toBe(0);
    expect(status.pending.length).toBe(0);
  });

  it("status() shows a current migration after migrate()", async () => {
    const service = await buildServiceAsync(ds);
    const status = await service.status();
    expect(status.current).not.toBeNull();
  });
});

// Helper: async version of buildService (needed for dynamic imports)
async function buildServiceAsync(
  ds: DataSource,
  options: import("@platform-core/infrastructure/application-database/migrator-service.ts").MigratorServiceOptions = {},
): Promise<MigratorService> {
  const { SchemaMigrationRepository } = await import(
    "@platform-core/infrastructure/application-database/repositories/SchemaMigrationRepository.ts"
  );
  const { EventRepository } = await import(
    "@platform-core/infrastructure/application-database/repositories/core/EventRepository.ts"
  );
  const { Event } = await import(
    "@platform-core/infrastructure/application-database/entities/core/Event.ts"
  );

  // Instantiate repos with the raw TypeORM repository
  const schemaMigRepo = Object.create(SchemaMigrationRepository.prototype) as InstanceType<typeof SchemaMigrationRepository>;
  Object.defineProperty(schemaMigRepo, "schemaMigrations", { value: ds.getRepository(SchemaMigration) });

  const eventRepo = Object.create(EventRepository.prototype) as InstanceType<typeof EventRepository>;
  Object.defineProperty(eventRepo, "events", { value: ds.getRepository(Event) });

  return new MigratorService(ds, schemaMigRepo, eventRepo, options);
}

describe("MigratorService — lossy-down protection", () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = await buildDs();
    const service = await buildServiceAsync(ds);
    await service.migrate();
  }, 20_000);

  afterAll(async () => {
    await ds.destroy();
  });

  it("throws target-not-found when migrating to a non-existent version", async () => {
    const service = await buildServiceAsync(ds);
    await expect(
      service.migrate("NON_EXISTENT_VERSION_THAT_IS_DEFINITELY_NOT_PENDING", false),
    ).rejects.toThrow(/target-not-found/);
  });

  it("migrate() with undefined target is idempotent when already at latest", async () => {
    const service = await buildServiceAsync(ds);
    await expect(service.migrate()).resolves.toBeUndefined();
    const status = await service.status();
    expect(status.pastDue).toBe(0);
  });
});

describe("doctor-checks", () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = await buildDs();
    await ds.runMigrations({ transaction: "none" });
  }, 20_000);

  afterAll(async () => {
    await ds.destroy();
  });

  it("MAX_KNOWN_MIGRATION_VERSION is a positive integer", () => {
    expect(typeof MAX_KNOWN_MIGRATION_VERSION).toBe("number");
    expect(MAX_KNOWN_MIGRATION_VERSION).toBeGreaterThan(0);
  });

  it("dbMigrationVersion returns warn status when no rows (fresh table)", async () => {
    const { SchemaMigrationRepository } = await import(
      "@platform-core/infrastructure/application-database/repositories/SchemaMigrationRepository.ts"
    );
    const repo = Object.create(SchemaMigrationRepository.prototype) as InstanceType<typeof SchemaMigrationRepository>;
    Object.defineProperty(repo, "schemaMigrations", { value: ds.getRepository(SchemaMigration) });
    // Clear ledger rows for this check (clear() avoids empty-criteria rejection from TypeORM)
    await ds.getRepository(SchemaMigration).clear();
    const result = await dbMigrationVersion(repo);
    expect(result.check).toBe("db.migrationVersion");
    expect(result.status).toBe("warn");
  });

  it("dbCanRunOnCurrentBinary returns pass when no rows", async () => {
    const { SchemaMigrationRepository } = await import(
      "@platform-core/infrastructure/application-database/repositories/SchemaMigrationRepository.ts"
    );
    const repo = Object.create(SchemaMigrationRepository.prototype) as InstanceType<typeof SchemaMigrationRepository>;
    Object.defineProperty(repo, "schemaMigrations", { value: ds.getRepository(SchemaMigration) });
    const result = await dbCanRunOnCurrentBinary(repo);
    expect(result.check).toBe("db.canRunOnCurrentBinary");
    expect(result.status).toBe("pass");
  });
});

describe("MigrationChecksumMismatchError shape", () => {
  it("has correct code and checksums", () => {
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

describe("LossyCheckFailedError shape", () => {
  it("has correct code and migrationPath", () => {
    const err = new LossyCheckFailedError("/path/to/migration.ts", new Error("oops"));
    expect(err.code).toBe("LOSSY_CHECK_FAILED");
    expect(err.migrationPath).toBe("/path/to/migration.ts");
    expect(err.message).toContain("lossy-check-failed");
  });
});

describe("MigrationFileMissingError shape", () => {
  it("has correct code and message", () => {
    const cause = new Error("ENOENT");
    const err = new MigrationFileMissingError("Migration20260501104413_auth", cause);
    expect(err.code).toBe("MIGRATION_FILE_MISSING");
    expect(err.message).toContain("Migration20260501104413_auth");
    expect(err.cause).toBe(cause);
  });
});

describe("db.router — PermissionNotAvailableError", () => {
  it("dbMigrate throws PermissionNotAvailableError (not null-pointer)", async () => {
    const { dbMigrate } = await import("@platform-core/infrastructure/application-database/db.router.ts");
    await expect(dbMigrate(null)).rejects.toThrow(PermissionNotAvailableError);
  });

  it("dbStatus throws PermissionNotAvailableError", async () => {
    const { dbStatus } = await import("@platform-core/infrastructure/application-database/db.router.ts");
    await expect(dbStatus(null)).rejects.toThrow(PermissionNotAvailableError);
  });

  it("PermissionNotAvailableError has code PERMISSION_NOT_AVAILABLE", () => {
    const err = new PermissionNotAvailableError();
    expect(err.code).toBe("PERMISSION_NOT_AVAILABLE");
  });
});

describe("fulcrum db migration command", () => {
  it("status with null container outputs pglite JSON via db command surface", async () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (line: unknown) => { lines.push(String(line)); };
    try {
      await runDbCommand(["status", "--json"], null);
    } finally {
      console.log = original;
    }

    const payload = JSON.parse(lines.join("\n"));
    expect(typeof payload.backend).toBe("string");
    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.pending)).toBe(true);
  });

  it("migrate rejects removed --url flag", async () => {
    await expect(
      runDbCommand(["migrate", "--url", "postgres://localhost/test", "--json"], null),
    ).rejects.toThrow(/explicit database backend flags were removed/);
  });
});
