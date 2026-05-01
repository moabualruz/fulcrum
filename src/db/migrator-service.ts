/**
 * MigratorService — Fulcrum migration framework wrapper.
 *
 * Wraps MikroORM's migrator (orm.migrator) and extends it with:
 *   - Per-migration checksum recording in schema_migrations.
 *   - Lossy-down protection: refuses `down()` without `force` when migration
 *     declares `static isLossy = true`, and emits a `migration.down-lossy-forced`
 *     Event row when forced through.
 *   - `status()`: pending migrations + current version.
 *   - `history()`: full schema_migrations audit ledger.
 *
 * C6: No raw SQL — MigratorService only calls orm.migrator.* + EntityRepository.
 * C7: MikroORM v7 `orm.migrator` (getter, not getMigrator() which is v5/v6).
 * C8: @injectable() via needle-di Stage-3 decorators.
 *
 * Pillar dependencies:
 *   - SchemaMigrationRepository: audit ledger.
 *   - EventRepository: writes `migration.down-lossy-forced` events.
 *
 * Closes (issue): .scratch/agent-os-vision/01-foundation-reset/issues/19-migration-up-down-versioning.md
 */

import { injectable } from "@needle-di/core";
import type { MikroORM, MigrationInfo } from "@mikro-orm/postgresql";
import { SchemaMigration } from "./entities/SchemaMigration.ts";
import { Event } from "./entities/core/Event.ts";
import { Org } from "./entities/auth/Org.ts";
import type { SchemaMigrationRepository } from "./repositories/SchemaMigrationRepository.ts";
import type { EventRepository } from "./repositories/core/EventRepository.ts";
import { checksumFile } from "./migration-checksums.ts";

/** Shape of a lossiness-aware migration class (augments standard Migration). */
interface LossyAwareMigrationClass {
  isLossy?: boolean;
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
 * Strategy: dynamically import the migration module and inspect the exported class.
 *
 * FAIL-CLOSED: if the module cannot be imported (file missing, parse error, etc.),
 * this function throws `LossyCheckFailedError` rather than returning `false`.
 * Treating unverifiable migrations as non-lossy would allow silent data-loss
 * in a corrupted or missing-file scenario — never acceptable.
 */
async function isMigrationLossy(
  migrationPath: string,
): Promise<boolean> {
  let mod: Record<string, unknown>;
  try {
    mod = await import(migrationPath) as Record<string, unknown>;
  } catch (cause) {
    // Fail-closed: cannot verify → throw, do not return false.
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
   *
   * Signature matches the module-internal `isMigrationLossy` function.
   * Inject a replacement in unit tests to simulate `isLossy=true` without
   * needing to create real migration files with that flag.
   *
   * Default: the real `isMigrationLossy` (dynamic import + class inspection).
   */
  isLossyResolver?: (migrationPath: string) => Promise<boolean>;

  /**
   * Override the checksum reader (test seam).
   *
   * Signature matches `checksumFile(path)` from migration-checksums.ts.
   * Inject a replacement to simulate file content changes without touching
   * the real migration files on disk.
   *
   * Default: the real `checksumFile` (Bun.file SHA-256).
   */
  checksumReader?: (filePath: string) => Promise<string>;
}

@injectable()
export class MigratorService {
  readonly #orm: MikroORM;
  readonly #schemaMigrationRepo: SchemaMigrationRepository;
  readonly #eventRepo: EventRepository;
  /** Absolute path to the migrations directory — resolved from orm config. */
  readonly #migrationsPath: string;
  /** Lossy-check resolver — can be overridden in tests via MigratorServiceOptions. */
  readonly #isLossyResolver: (migrationPath: string) => Promise<boolean>;
  /** Checksum file reader — can be overridden in tests via MigratorServiceOptions. */
  readonly #checksumReader: (filePath: string) => Promise<string>;

  constructor(
    orm: MikroORM,
    schemaMigrationRepo: SchemaMigrationRepository,
    eventRepo: EventRepository,
    options: MigratorServiceOptions = {},
  ) {
    this.#orm = orm;
    this.#schemaMigrationRepo = schemaMigrationRepo;
    this.#eventRepo = eventRepo;
    this.#isLossyResolver = options.isLossyResolver ?? isMigrationLossy;
    this.#checksumReader = options.checksumReader ?? checksumFile;

    // Resolve migrations path from ORM config (set in mikro-orm.config.ts).
    const configPath = this.#orm.config.get("migrations") as { path?: string } | undefined;
    this.#migrationsPath = configPath?.path ?? new URL("./migrations", import.meta.url).pathname;
  }

  /**
   * Run migrations to the specified target version.
   *
   * If `targetVersion` is undefined → migrate to latest.
   * If `targetVersion` is a name/version older than current → run down migrations.
   *
   * After each migration:
   *   - Writes a SchemaMigration row with checksum + direction.
   *   - (down) Checks `isLossy` on the migration class — refuses without `force`.
   *   - (down + force) Emits `migration.down-lossy-forced` Event row.
   */
  async migrate(
    targetVersion?: string | number,
    force = false,
  ): Promise<void> {
    const migrator = this.#orm.migrator;

    // Pre-flight: validate checksums of all previously-applied migrations.
    // If any migration file changed after apply, throw MigrationChecksumMismatchError.
    // This enforces C6: migration files are immutable after apply.
    await this.#validateChecksums();

    // Determine direction by comparing current DB state vs target.
    // If no target specified → always up.
    const pending = await migrator.getPending();
    const executed = await migrator.getExecuted();

    if (targetVersion === undefined) {
      // Migrate fully up.
      const applied = await migrator.up();
      await this.#recordResults(applied, "up");
      return;
    }

    const targetStr = String(targetVersion);

    // Check if target is in the pending list → go up to target.
    const isPending = pending.some(
      (m) => m.name === targetStr || m.name.startsWith(targetStr),
    );

    if (isPending) {
      const applied = await migrator.up({ to: targetStr });
      await this.#recordResults(applied, "up");
      return;
    }

    // Check if target is an already-executed migration → go down to target.
    const isExecuted = executed.some(
      (m) => m.name === targetStr || m.name.startsWith(targetStr),
    );

    if (isExecuted) {
      // Down: check lossiness before executing.
      // We need to run down from current to target, which means reverting all
      // migrations AFTER the target. Find those migrations.
      const currentIdx = executed.length - 1;
      const targetIdx = executed.findIndex(
        (m) => m.name === targetStr || m.name.startsWith(targetStr),
      );

      // All migrations from (targetIdx+1) to currentIdx will be reverted.
      const toRevert = executed.slice(targetIdx + 1);

      for (const m of toRevert) {
        const migPath = `${this.#migrationsPath}/${m.name}.ts`;
        // #isLossyResolver throws LossyCheckFailedError if file unreadable (fail-closed).
        if (await this.#isLossyResolver(migPath)) {
          if (!force) {
            throw new LossyDownProtectedError(m.name);
          }
          // Forced lossy down — emit warning event.
          await this.#emitLossyForcedEvent(m.name);
        }
      }

      const reverted = await migrator.down({ to: targetStr });
      await this.#recordResults(reverted, "down");
      return;
    }

    throw new Error(
      `migration.target-not-found: '${targetStr}' is neither pending nor executed.`,
    );
  }

  /**
   * Returns current migration state.
   *   - `current`: name of the most-recently applied migration.
   *   - `pending`: list of pending migration names.
   *   - `pastDue`: count of pending migrations.
   */
  async status(): Promise<MigrationStatus> {
    const migrator = this.#orm.migrator;
    // Sequential calls — both call ensureTable() internally; parallel calls race on table creation.
    const executed = await migrator.getExecuted();
    const pending = await migrator.getPending();

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
   * Ordered by version ascending.
   */
  async history(): Promise<SchemaMigration[]> {
    // Fork EM to avoid "global context" validation error.
    const em = this.#orm.em.fork();
    const repo = em.getRepository(SchemaMigration) as SchemaMigrationRepository;
    return repo.findAll({ orderBy: { version: "ASC" } });
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Pre-flight checksum validation.
   *
   * Reads all SchemaMigration ledger rows and verifies each migration file's
   * current SHA-256 matches the stored checksum at apply-time.
   *
   * Throws `MigrationChecksumMismatchError` if any mismatch is detected.
   * Silently skips rows where the file cannot be read (e.g. test environments
   * with empty checksums stored as "").
   *
   * C6 enforcement: migration files must not change after apply.
   */
  async #validateChecksums(): Promise<void> {
    let rows: SchemaMigration[];
    try {
      const em = this.#orm.em.fork();
      const repo = em.getRepository(SchemaMigration) as SchemaMigrationRepository;
      rows = await repo.findAll({ orderBy: { version: "ASC" } });
    } catch {
      // schema_migrations table may not exist yet (e.g. on first run before ledger migration).
      // Skip validation — no ledger rows means no checksums to validate.
      return;
    }

    for (const row of rows) {
      // Skip rows with empty checksum (e.g. set during bootstrapping / test environments).
      if (!row.checksum) continue;

      const migPath = `${this.#migrationsPath}/${row.name}.ts`;
      let currentChecksum: string;
      try {
        currentChecksum = await this.#checksumReader(migPath);
      } catch (cause) {
        // File not readable — fail closed (C6 / security).
        // An applied migration with an unreadable source file is suspicious:
        // it may indicate deliberate deletion to mask a re-apply attack.
        // Do NOT skip silently; throw and surface to the caller.
        throw new MigrationFileMissingError(row.name, cause);
      }

      if (currentChecksum !== row.checksum) {
        throw new MigrationChecksumMismatchError(row.name, row.checksum, currentChecksum);
      }
    }
  }

  /**
   * Extract the numeric version from a migration class name.
   *
   * Convention: "Migration<timestamp>_slug" → numeric timestamp.
   * Example: "Migration20260501104413_auth" → 20260501104413n (as Number).
   *
   * Falls back to Date.now() if the pattern does not match (should never happen
   * for well-formed migration class names; logged as a warning).
   */
  static #extractVersion(migrationName: string): number {
    const match = /Migration(\d+)/.exec(migrationName);
    if (match?.[1]) {
      return Number(match[1]);
    }
    // Fallback: should never happen for correct migration names.
    console.warn(
      `[MigratorService] Cannot extract numeric version from '${migrationName}' — using Date.now() fallback.`,
    );
    return Date.now();
  }

  /** Write SchemaMigration rows for each applied/reverted MigrationInfo. */
  async #recordResults(
    results: MigrationInfo[],
    direction: "up" | "down",
  ): Promise<void> {
    if (results.length === 0) return;

    // Fork EM so we have a clean context for writes.
    const em = this.#orm.em.fork();
    const repo = em.getRepository(SchemaMigration) as SchemaMigrationRepository;

    for (const info of results) {
      const migPath = `${this.#migrationsPath}/${info.name}.ts`;
      let checksum = "";
      try {
        checksum = await this.#checksumReader(migPath);
      } catch {
        // File might not be readable (e.g. in-memory test environment) — use empty string.
        checksum = "";
      }

      // Derive caller-supplied version from migration class name (timestamp portion).
      // version is bigint PK — must be supplied explicitly (not auto-increment).
      const version = MigratorService.#extractVersion(info.name);

      try {
        // Upsert: if a row for this migration name already exists, update it.
        const existing = await repo.findOne({ name: info.name });
        if (existing) {
          existing.direction = direction;
          existing.appliedAt = new Date();
          existing.checksum = checksum;
        } else {
          em.create(SchemaMigration, {
            version,
            name: info.name,
            checksum,
            direction,
            appliedAt: new Date(),
          });
        }

        await em.flush();
      } catch {
        // schema_migrations table may not yet exist (migrations before the ledger migration).
        // Silently skip — once the ledger migration itself runs, subsequent writes succeed.
        // On error, clear the EM identity map to avoid stale state.
        em.clear();
      }
    }
  }

  /** Emit a `migration.down-lossy-forced` Event row. */
  async #emitLossyForcedEvent(migrationName: string): Promise<void> {
    // Fork EM for a clean write context.
    const em = this.#orm.em.fork();
    const WELL_KNOWN_ORG_ID = "00000000-0000-0000-0000-000000000001";

    const orgRef = em.getReference(Org, WELL_KNOWN_ORG_ID);

    em.create(Event, {
      org: orgRef,
      verb: "migration.down-lossy-forced",
      subjectKind: "migration",
      subjectId: migrationName,
      payload: { migration: migrationName },
      createdAt: new Date(),
    });

    await em.flush();
  }
}
