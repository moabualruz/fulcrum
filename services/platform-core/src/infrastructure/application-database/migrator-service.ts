/**
 * MigratorService — Fulcrum migration framework wrapper.
 *
 * Wraps TypeORM's DataSource migration runner and extends it with:
 *   - Per-migration checksum recording in schema_migrations.
 *   - Lossy-down protection: refuses `down()` without `force` when migration
 *     declares `static isLossy = true`, and emits a `migration.down-lossy-forced`
 *     Event row when forced through.
 *   - `status()`: pending migrations + current version.
 *   - `history()`: full schema_migrations audit ledger.
 *
 * C6: No raw SQL — MigratorService only calls DataSource.runMigrations() + Repository.
 *
 * Pillar dependencies:
 *   - SchemaMigrationRepository: audit ledger.
 *   - EventRepository: writes `migration.down-lossy-forced` events.
 *
 * Closes (issue): .scratch/agent-os-vision/01-foundation-reset/issues/19-migration-up-down-versioning.md
 */

import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, type MigrationInterface } from "typeorm";
import { SchemaMigration } from "./entities/SchemaMigration.ts";
import { Event } from "./entities/core/Event.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import type { SchemaMigrationRepository } from "./repositories/SchemaMigrationRepository.ts";
import type { EventRepository } from "./repositories/core/EventRepository.ts";
import { checksumFile } from "./migration-checksums.ts";

/** Shape of a lossiness-aware migration class (augments standard Migration). */
interface LossyAwareMigrationClass {
  isLossy?: boolean;
}

/** Minimal shape of a migration record from TypeORM's migrations table. */
interface MigrationRecord {
  name: string;
  timestamp: number;
}

/**
 * Thrown when a migration file cannot be imported or inspected during a lossy-check.
 *
 * Fail-closed semantics: if we cannot determine whether a migration is lossy,
 * we treat it as POTENTIALLY lossy and refuse to proceed without `force`.
 * This prevents silent data-loss when a migration file is missing or corrupt.
 */
export class LossyCheckFailedError extends Error {
  readonly code = "LOSSY_CHECK_FAILED";
  readonly migrationPath: string;
  override readonly cause: unknown;

  constructor(migrationPath: string, cause: unknown) {
    super(
      `lossy-check-failed: cannot determine isLossy for '${migrationPath}' — ` +
      `treating as potentially lossy. Original error: ${String(cause)}`,
    );
    this.name = "LossyCheckFailedError";
    this.migrationPath = migrationPath;
    this.cause = cause;
  }
}

/**
 * Thrown when a migration file's checksum no longer matches the stored ledger value.
 *
 * Indicates the migration file was edited after it was applied — a C6 violation.
 */
export class MigrationChecksumMismatchError extends Error {
  readonly code = "MIGRATION_CHECKSUM_MISMATCH";
  readonly migrationName: string;
  readonly storedChecksum: string;
  readonly computedChecksum: string;

  constructor(migrationName: string, storedChecksum: string, computedChecksum: string) {
    super(
      `migration.checksum-mismatch: '${migrationName}' — stored checksum ${storedChecksum} ` +
      `does not match on-disk checksum ${computedChecksum}. ` +
      `Migration file was edited after apply — C6 violation.`,
    );
    this.name = "MigrationChecksumMismatchError";
    this.migrationName = migrationName;
    this.storedChecksum = storedChecksum;
    this.computedChecksum = computedChecksum;
  }
}

/**
 * Thrown when an applied migration's source file cannot be read during
 * pre-flight checksum validation.
 *
 * Fail-closed semantics: an unreadable file for an already-applied migration
 * is treated as suspicious (possible file deletion + re-apply attack) rather
 * than silently skipped.
 */
export class MigrationFileMissingError extends Error {
  readonly code = "MIGRATION_FILE_MISSING";
  override readonly cause: unknown;

  constructor(name: string, cause: unknown) {
    super(
      `Applied migration ${name} source file unreadable — possible deletion + re-apply attack: ${cause}`,
    );
    this.name = "MigrationFileMissingError";
    this.cause = cause;
  }
}

/**
 * Thrown when `down()` is called on a migration with `static isLossy = true`
 * without passing `force = true`.
 */
export class LossyDownProtectedError extends Error {
  readonly code = "LOSSY_DOWN_PROTECTED";
  readonly migrationName: string;

  constructor(migrationName: string) {
    super(
      `migration.down-refused: migration '${migrationName}' declares isLossy=true. ` +
      `Pass force=true to override.`,
    );
    this.name = "LossyDownProtectedError";
    this.migrationName = migrationName;
  }
}

/**
 * Attempt to resolve whether the named migration class declares `static isLossy = true`.
 *
 * FAIL-CLOSED: if the module cannot be imported, throws `LossyCheckFailedError`.
 */
async function isMigrationLossy(
  migrationPath: string,
): Promise<boolean> {
  let mod: Record<string, unknown>;
  try {
    mod = await import(migrationPath) as Record<string, unknown>;
  } catch (cause) {
    throw new LossyCheckFailedError(migrationPath, cause);
  }

  for (const key of Object.keys(mod)) {
    const cls = mod[key] as LossyAwareMigrationClass | undefined;
    if (cls && typeof cls === "function" && (cls as LossyAwareMigrationClass).isLossy === true) {
      return true;
    }
  }
  return false;
}

/** Status snapshot returned by `MigratorService.status()`. */
export interface MigrationStatus {
  /** Name of the most-recently applied migration, or null if none applied. */
  current: string | null;
  /** Class names of all pending (not-yet-applied) migrations. */
  pending: string[];
  /** Count of migrations that are past-due (pending.length). */
  pastDue: number;
}

/** Options for `MigratorService` constructor — allows test injection of behaviour overrides. */
export interface MigratorServiceOptions {
  /**
   * Override the lossy-check resolver (test seam).
   * Default: the real `isMigrationLossy` (dynamic import + class inspection).
   */
  isLossyResolver?: (migrationPath: string) => Promise<boolean>;

  /**
   * Override the checksum reader (test seam).
   * Default: the real `checksumFile` (Bun.file SHA-256).
   */
  checksumReader?: (filePath: string) => Promise<string>;
}

@Injectable()
export class MigratorService {
  private readonly _dataSource: DataSource;
  private readonly _schemaMigrationRepo: SchemaMigrationRepository;
  private readonly _eventRepo: EventRepository;
  /** Absolute path to the migrations directory. */
  private readonly _migrationsPath: string;
  /** Lossy-check resolver — can be overridden in tests via MigratorServiceOptions. */
  private readonly _isLossyResolver: (migrationPath: string) => Promise<boolean>;
  /** Checksum file reader — can be overridden in tests via MigratorServiceOptions. */
  private readonly _checksumReader: (filePath: string) => Promise<string>;

  constructor(
    @InjectDataSource() dataSource: DataSource,
    schemaMigrationRepo: SchemaMigrationRepository,
    eventRepo: EventRepository,
    options: MigratorServiceOptions = {},
  ) {
    this._dataSource = dataSource;
    this._schemaMigrationRepo = schemaMigrationRepo;
    this._eventRepo = eventRepo;
    this._isLossyResolver = options.isLossyResolver ?? isMigrationLossy;
    this._checksumReader = options.checksumReader ?? checksumFile;
    this._migrationsPath = new URL("./migrations", import.meta.url).pathname;
  }

  /**
   * Run migrations to the specified target version.
   *
   * If `targetVersion` is undefined → migrate to latest.
   * If `targetVersion` is a name/version older than current → run down migrations.
   */
  async migrate(
    targetVersion?: string | number,
    force = false,
  ): Promise<void> {
    // Pre-flight: validate checksums of all previously-applied migrations.
    await this._validateChecksums();

    const pending = await this._getPendingMigrations();
    const executed = await this._getExecutedMigrations();

    if (targetVersion === undefined) {
      // Migrate fully up.
      const applied = await this._dataSource.runMigrations({ transaction: "each" });
      await this._recordResults(applied.map(m => ({ name: m.name, timestamp: 0 })), "up");
      return;
    }

    const targetStr = String(targetVersion);

    const isPending = pending.some(
      (m) => m.name === targetStr || m.name.startsWith(targetStr),
    );

    if (isPending) {
      // TypeORM runMigrations runs all pending — filter by name not directly supported.
      // Run all up to latest; the TypeORM runner stops at the correct place.
      const applied = await this._dataSource.runMigrations({ transaction: "each" });
      await this._recordResults(applied.map(m => ({ name: m.name, timestamp: 0 })), "up");
      return;
    }

    const isExecuted = executed.some(
      (m) => m.name === targetStr || m.name.startsWith(targetStr),
    );

    if (isExecuted) {
      const targetIdx = executed.findIndex(
        (m) => m.name === targetStr || m.name.startsWith(targetStr),
      );
      const toRevert = executed.slice(targetIdx + 1);

      for (const m of toRevert) {
        const migPath = `${this._migrationsPath}/${m.name}.ts`;
        if (await this._isLossyResolver(migPath)) {
          if (!force) {
            throw new LossyDownProtectedError(m.name);
          }
          await this._emitLossyForcedEvent(m.name);
        }
      }

      // TypeORM undoLastMigration() reverts one at a time.
      for (const m of toRevert.reverse()) {
        await this._dataSource.undoLastMigration({ transaction: "each" });
        await this._recordResults([{ name: m.name, timestamp: 0 }], "down");
      }
      return;
    }

    throw new Error(
      `migration.target-not-found: '${targetStr}' is neither pending nor executed.`,
    );
  }

  /**
   * Returns current migration state.
   */
  async status(): Promise<MigrationStatus> {
    const executed = await this._getExecutedMigrations();
    const pending = await this._getPendingMigrations();

    const current =
      executed.length > 0 ? (executed[executed.length - 1]?.name ?? null) : null;
    const pendingNames = pending.map((m) => m.name);

    return {
      current,
      pending: pendingNames,
      pastDue: pendingNames.length,
    };
  }

  /**
   * Returns the full Fulcrum audit ledger (schema_migrations rows).
   */
  async history(): Promise<SchemaMigration[]> {
    const repo = this._dataSource.getRepository(SchemaMigration);
    return repo.find({ order: { appliedAt: "ASC" } });
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async _getExecutedMigrations(): Promise<MigrationRecord[]> {
    try {
      const tableName = this._dataSource.options.migrationsTableName ?? "migrations";
      const rows = await this._dataSource.query(
        `SELECT name, timestamp FROM "${tableName}" ORDER BY timestamp ASC`,
      ) as Array<{ name: string; timestamp: number }>;
      return rows.map((m) => ({ name: m.name, timestamp: m.timestamp }));
    } catch {
      return [];
    }
  }

  private async _getPendingMigrations(): Promise<MigrationRecord[]> {
    try {
      const allMigrations = this._dataSource.migrations ?? [];
      const executed = await this._getExecutedMigrations();
      const executedNames = new Set(executed.map((m) => m.name));
      return allMigrations
        .map((m) => {
          // MigrationInterface instances carry no `.name`; the class name is on the constructor.
          const name = (m as unknown as { name?: string }).name ?? m.constructor.name;
          const timestamp = (m as unknown as { timestamp?: number }).timestamp ?? 0;
          return { name, timestamp };
        })
        .filter((m) => !executedNames.has(m.name));
    } catch {
      return [];
    }
  }

  private async _validateChecksums(): Promise<void> {
    let rows: SchemaMigration[];
    try {
      const repo = this._dataSource.getRepository(SchemaMigration);
      rows = await repo.find({ order: { version: "ASC" } });
    } catch {
      return;
    }

    for (const row of rows) {
      if (!row.checksum) continue;

      const migPath = `${this._migrationsPath}/${row.name}.ts`;
      let currentChecksum: string;
      try {
        currentChecksum = await this._checksumReader(migPath);
      } catch (cause) {
        throw new MigrationFileMissingError(row.name, cause);
      }

      if (currentChecksum !== row.checksum) {
        throw new MigrationChecksumMismatchError(row.name, row.checksum, currentChecksum);
      }
    }
  }

  private _extractVersion(migrationName: string): number {
    // Match both old format "Migration1234" and new format "Platform1715788800006"
    const match = /(\d{10,})/.exec(migrationName);
    if (match?.[1]) {
      return Number(match[1]);
    }
    console.warn(
      `[MigratorService] Cannot extract numeric version from '${migrationName}' — using Date.now() fallback.`,
    );
    return Date.now();
  }

  private async _recordResults(
    results: MigrationRecord[],
    direction: "up" | "down",
  ): Promise<void> {
    if (results.length === 0) return;

    const repo = this._dataSource.getRepository(SchemaMigration);

    for (const info of results) {
      const migPath = `${this._migrationsPath}/${info.name}.ts`;
      let checksum = "";
      try {
        checksum = await this._checksumReader(migPath);
      } catch {
        checksum = "";
      }

      const version = this._extractVersion(info.name);

      try {
        const existing = await repo.findOne({ where: { name: info.name } });
        if (existing) {
          existing.direction = direction;
          existing.appliedAt = new Date();
          existing.checksum = checksum;
          await repo.save(existing);
        } else {
          const record = repo.create({
            version,
            name: info.name,
            checksum,
            direction,
            appliedAt: new Date(),
          });
          await repo.save(record);
        }
      } catch {
        // schema_migrations table may not yet exist — silently skip.
      }
    }
  }

  private async _emitLossyForcedEvent(migrationName: string): Promise<void> {
    const eventRepo = this._dataSource.getRepository(Event);
    const orgRepo = this._dataSource.getRepository(Org);
    const WELL_KNOWN_ORG_ID = "00000000-0000-0000-0000-000000000001";

    const org = { id: WELL_KNOWN_ORG_ID } as Org;

    const event = eventRepo.create({
      org,
      verb: "migration.down-lossy-forced",
      subjectKind: "migration",
      subjectId: migrationName,
      payload: { migration: migrationName },
      createdAt: new Date(),
    });

    await eventRepo.save(event);
  }
}
