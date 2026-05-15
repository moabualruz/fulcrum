import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { Event } from "@platform-core/infrastructure/application-database/entities/core/Event.ts";
import { SchemaMigration } from "@platform-core/infrastructure/application-database/entities/SchemaMigration.ts";
import {
  LossyCheckFailedError,
  LossyDownProtectedError,
  MigratorService,
  MigrationChecksumMismatchError,
  MigrationFileMissingError,
} from "@platform-core/infrastructure/application-database/migrator-service.ts";

type FakeMigration = { name: string };

interface FakeServiceOptions {
  migrationsPath?: string;
  pending?: FakeMigration[];
  executed?: FakeMigration[];
  repoRows?: Array<{ name: string; checksum: string }>;
  repoFindOne?: (query: { name: string }) => Promise<Record<string, unknown> | null>;
  checksumReader?: (path: string) => Promise<string>;
  isLossyResolver?: (path: string) => Promise<boolean>;
  upResult?: FakeMigration[];
  downResult?: FakeMigration[];
}

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function tempMigrationsDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "fulcrum-migrator-unit-"));
  tempDirs.push(dir);
  return dir;
}

function buildFakeService(options: FakeServiceOptions = {}) {
  const created: Array<{ entity: unknown; data: Record<string, unknown> }> = [];
  const flushed: string[] = [];
  const cleared: string[] = [];
  const runUpCalls: Array<{ to?: string }> = [];
  const runDownCalls: string[] = [];

  // Schema migration repo (TypeORM Repository<SchemaMigration> shape)
  const schemaMigrationRepo = {
    findOne: mock(async (opts?: { where?: { name?: string } }) => {
      const name = opts?.where?.name;
      if (name && options.repoFindOne) return await options.repoFindOne({ name });
      return null;
    }),
    find: mock(async (_opts?: unknown) => options.repoRows ?? []),
    create: mock((data: Record<string, unknown>) => {
      created.push({ entity: SchemaMigration, data });
      return data;
    }),
    save: mock(async (_entity: unknown) => {}),
  };

  // Event repo (TypeORM Repository<Event> shape)
  const eventRepo = {
    create: mock((data: Record<string, unknown>) => {
      created.push({ entity: Event, data });
      return data;
    }),
    save: mock(async (_entity: unknown) => {}),
  };

  // org repo
  const orgRepo = {
    findOne: mock(async () => null),
  };

  // TypeORM DataSource mock
  const executedMigrations = options.executed ?? [];
  const pendingMigrations = options.pending ?? [];

  const dataSource = {
    // _getPendingMigrations reads this array
    migrations: pendingMigrations.map((m) => ({ name: m.name, timestamp: 0, up: async () => {}, down: async () => {} })),
    // _getExecutedMigrations queries migrations table
    query: mock(async (sql: string) => {
      if (sql.includes("FROM migrations") || sql.includes("from migrations")) {
        return executedMigrations.map((m) => ({ name: m.name, timestamp: 0 }));
      }
      return [];
    }),
    runMigrations: mock(async (_opts?: unknown) => {
      runUpCalls.push({});
      return (options.upResult ?? []).map((m) => ({ name: m.name, timestamp: 0, up: async () => {}, down: async () => {} }));
    }),
    undoLastMigration: mock(async (_opts?: unknown) => {
      runDownCalls.push("down");
    }),
    getRepository: mock((entity: unknown) => {
      if (entity === SchemaMigration || (typeof entity === "function" && entity.name === "SchemaMigration")) {
        return schemaMigrationRepo;
      }
      if (entity === Event || (typeof entity === "function" && entity.name === "Event")) {
        return eventRepo;
      }
      return orgRepo;
    }),
  };

  // Expose migrator-like facade for test assertions
  const migrator = {
    up: {
      mock: {
        calls: [] as unknown[][],
      },
    },
    down: {
      mock: {
        calls: [] as unknown[][],
      },
    },
    get _runUpCalls() { return runUpCalls; },
    get _runDownCalls() { return runDownCalls; },
  };

  const em = {
    flush: mock(async () => {
      flushed.push("flush");
    }),
    clear: mock(() => {
      cleared.push("clear");
    }),
  };

  const service = new MigratorService(
    dataSource as never,
    schemaMigrationRepo as never,
    { manager: { save: mock(async () => {}), create: eventRepo.create } } as never,
    {
      checksumReader: options.checksumReader,
      isLossyResolver: options.isLossyResolver,
    },
  );

  // Override migrations path if provided
  if (options.migrationsPath) {
    (service as any)._migrationsPath = options.migrationsPath;
  }

  return { service, migrator, repo: schemaMigrationRepo, em, created, flushed, cleared, existingRows: [] as Record<string, unknown>[], dataSource };
}

describe("MigratorService branch behavior with controlled collaborators", () => {
  test("migrates upward to a pending target prefix and records checksumed ledger rows", async () => {
    const target = "Migration20260512010101_pending_branch";
    const { service, dataSource, created } = buildFakeService({
      pending: [{ name: target }],
      upResult: [{ name: target }],
      checksumReader: async () => "checksum-a",
    });

    await service.migrate("Migration20260512010101");

    expect(dataSource.runMigrations).toHaveBeenCalled();
    expect(created).toEqual([
      expect.objectContaining({
        entity: SchemaMigration,
        data: expect.objectContaining({
          version: 20260512010101,
          name: target,
          checksum: "checksum-a",
          direction: "up",
        }),
      }),
    ]);
  });

  test("updates an existing ledger row instead of inserting a duplicate", async () => {
    const target = "Migration20260512020202_existing_branch";
    const existing = { name: target, checksum: "old", direction: "up", appliedAt: new Date("2026-01-01T00:00:00.000Z") };
    const { service, created } = buildFakeService({
      pending: [{ name: target }],
      upResult: [{ name: target }],
      repoFindOne: async () => existing,
      checksumReader: async () => "new-checksum",
    });

    await service.migrate(target);

    expect(created).toEqual([]);
    expect(existing).toMatchObject({ checksum: "new-checksum", direction: "up" });
    expect(existing.appliedAt.getTime()).toBeGreaterThan(new Date("2026-01-01T00:00:00.000Z").getTime());
  });

  test("forced lossy downgrade emits the audit event before running down", async () => {
    const target = "Migration20260512030303_target";
    const lossy = "Migration20260512040404_lossy";
    const { service, dataSource, created } = buildFakeService({
      executed: [{ name: target }, { name: lossy }],
      downResult: [{ name: lossy }],
      isLossyResolver: async () => true,
      checksumReader: async () => "",
    });

    await service.migrate(target, true);

    expect(dataSource.undoLastMigration).toHaveBeenCalled();
    expect(created).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entity: Event,
        data: expect.objectContaining({
          verb: "migration.down-lossy-forced",
          subjectKind: "migration",
          subjectId: lossy,
          payload: { migration: lossy },
        }),
      }),
      expect.objectContaining({
        entity: SchemaMigration,
        data: expect.objectContaining({ name: lossy, direction: "down" }),
      }),
    ]));
  });

  test("unforced lossy downgrade stops before calling migrator.down", async () => {
    const target = "Migration20260512050505_target";
    const lossy = "Migration20260512060606_lossy";
    const { service, dataSource } = buildFakeService({
      executed: [{ name: target }, { name: lossy }],
      isLossyResolver: async () => true,
    });

    await expect(service.migrate(target, false)).rejects.toThrow(LossyDownProtectedError);
    expect(dataSource.undoLastMigration).not.toHaveBeenCalled();
  });

  test("real migration lossiness resolver imports migration files and fails closed on missing files", async () => {
    const dir = await tempMigrationsDir();
    const target = "Migration20260512070707_target";
    const lossy = "Migration20260512080808_lossy";
    await writeFile(
      join(dir, `${lossy}.ts`),
      "export class Migration20260512080808_lossy { static isLossy = true; }\n",
    );
    const lossyService = buildFakeService({
      migrationsPath: dir,
      executed: [{ name: target }, { name: lossy }],
    }).service;

    await expect(lossyService.migrate(target, false)).rejects.toThrow(LossyDownProtectedError);

    const missingService = buildFakeService({
      migrationsPath: dir,
      executed: [{ name: target }, { name: "Migration20260512090909_missing" }],
    }).service;
    await expect(missingService.migrate(target, false)).rejects.toThrow(LossyCheckFailedError);
  });

  test("status and history use the forked repository read paths", async () => {
    const current = "Migration20260512101010_current";
    const pending = "Migration20260512111111_pending";
    const rows = [{ version: 20260510101010, name: current, checksum: "checksum", appliedAt: new Date(0), direction: "up" as const }];
    const { service, repo } = buildFakeService({
      executed: [{ name: current }],
      pending: [{ name: pending }],
      repoRows: rows,
    });

    await expect(service.status()).resolves.toEqual({
      current,
      pending: [pending],
      pastDue: 1,
    });
    await expect(service.history()).resolves.toBe(rows);
    expect(repo.find).toHaveBeenLastCalledWith({ order: { appliedAt: "ASC" } });
  });

  test("checksum validation skips empty checksums and throws mismatch or missing-file errors", async () => {
    const applied = "Migration20260512121212_applied";
    const skipped = "Migration20260512131313_empty_checksum";
    const mismatch = buildFakeService({
      executed: [{ name: applied }],
      repoRows: [{ name: skipped, checksum: "" }, { name: applied, checksum: "old" }],
      checksumReader: async () => "new",
    }).service;

    await expect(mismatch.migrate()).rejects.toThrow(MigrationChecksumMismatchError);

    const missing = buildFakeService({
      executed: [{ name: applied }],
      repoRows: [{ name: applied, checksum: "old" }],
      checksumReader: async () => {
        throw new Error("ENOENT");
      },
    }).service;

    await expect(missing.migrate()).rejects.toThrow(MigrationFileMissingError);
  });

  test("recording migration results tolerates unreadable source files and missing ledger table", async () => {
    const target = "Migration_without_numeric_version";
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (message?: unknown) => {
      warnings.push(String(message));
    };
    try {
      const { service, created, cleared } = buildFakeService({
        pending: [{ name: target }],
        upResult: [{ name: target }],
        checksumReader: async () => {
          throw new Error("ENOENT");
        },
      });

      await service.migrate(target);

      expect(created).toEqual([
        expect.objectContaining({
          data: expect.objectContaining({ name: target, checksum: "", direction: "up" }),
        }),
      ]);
      expect(warnings.join("\n")).toContain("Cannot extract numeric version");
      expect(cleared).toEqual([]);
    } finally {
      console.warn = originalWarn;
    }
  });
});
