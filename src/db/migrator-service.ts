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
 * Attempt to resolve whether the named migration class declares `static isLossy = true`.
 *
 * Strategy: dynamically import the migration module and inspect the exported class.
 * Returns `false` if the module cannot be imported or the property is absent.
 */
async function isMigrationLossy(
  migrationPath: string,
): Promise<boolean> {
  try {
    const mod = await import(migrationPath) as Record<string, unknown>;
    for (const key of Object.keys(mod)) {
      const cls = mod[key] as LossyAwareMigrationClass | undefined;
      if (cls && typeof cls === "function" && (cls as LossyAwareMigrationClass).isLossy === true) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
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

@injectable()
export class MigratorService {
  readonly #orm: MikroORM;
  readonly #schemaMigrationRepo: SchemaMigrationRepository;
  readonly #eventRepo: EventRepository;
  /** Absolute path to the migrations directory — resolved from orm config. */
  readonly #migrationsPath: string;

  constructor(
    orm: MikroORM,
    schemaMigrationRepo: SchemaMigrationRepository,
    eventRepo: EventRepository,
  ) {
    this.#orm = orm;
    this.#schemaMigrationRepo = schemaMigrationRepo;
    this.#eventRepo = eventRepo;

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
        if (await isMigrationLossy(migPath)) {
          if (!force) {
            throw new Error(
              `migration.down-refused: migration '${m.name}' declares isLossy=true. ` +
              `Pass force=true to override.`,
            );
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
        checksum = await checksumFile(migPath);
      } catch {
        // File might not be readable (e.g. in-memory test environment) — use empty string.
        checksum = "";
      }

      try {
        // Upsert: if a row for this migration name already exists, update it.
        const existing = await repo.findOne({ name: info.name });
        if (existing) {
          existing.direction = direction;
          existing.appliedAt = new Date();
          existing.checksum = checksum;
        } else {
          em.create(SchemaMigration, {
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
