/**
 * doctor-checks — db domain doctor integration.
 *
 * Provides two health-check functions for the Fulcrum doctor subsystem:
 *   - dbMigrationVersion: highest applied migration version + name.
 *   - dbCanRunOnCurrentBinary: compares DB's max version to compile-time max.
 *
 * ⚠️  DEFER NOTE (P1#19 / Pillar 14): The doctor aggregator framework is owned
 *     by Pillar 14. These checks are implemented here as plain async functions.
 *     Registration with the aggregator happens when Pillar 14 lands; at that
 *     point import these functions and call `doctorRegistry.register(...)`.
 *
 * C6: No raw SQL — queries via SchemaMigrationRepository.
 * C8: Consumes MigratorService / SchemaMigrationRepository via needle-di container.
 *
 * Closes (issue): .scratch/agent-os-vision/01-foundation-reset/issues/19-migration-up-down-versioning.md
 */

import type { SchemaMigrationRepository } from "./repositories/SchemaMigrationRepository.ts";

/** Shape of a doctor check result. */
export interface DoctorCheckResult {
  /** Check identifier, e.g. "db.migrationVersion". */
  check: string;
  /** "pass" | "fail" | "warn" */
  status: "pass" | "fail" | "warn";
  /**
   * Human-readable detail.
   *
   * Field name: `detail` (aligned with Pillar 14 doctor contract spec).
   * TODO(P14): When Pillar 14 doctor aggregator lands, confirm this field name
   * matches the aggregator's DoctorCheckResult type and remove this TODO.
   */
  detail: string;
  /** Optional hint for recovery. */
  hint?: string;
}

/**
 * Compile-time constant: the highest migration version this binary knows about.
 * Update this whenever a new migration class is added to src/db/migrations/.
 *
 * Convention: numeric timestamp portion of the migration filename.
 * Pillar 14's doctor aggregator compares this against schema_migrations.MAX(version).
 */
export const MAX_KNOWN_MIGRATION_VERSION = 20260502050000;

/**
 * db.migrationVersion — returns the highest applied migration version + name.
 *
 * @param schemaMigrationRepo — inject from needle-di container.
 */
export async function dbMigrationVersion(
  schemaMigrationRepo: SchemaMigrationRepository,
): Promise<DoctorCheckResult> {
  const rows = await schemaMigrationRepo.findAll({
    orderBy: { version: "DESC" },
    limit: 1,
  });

  if (rows.length === 0) {
    return {
      check: "db.migrationVersion",
      status: "warn",
      detail: "No migrations applied yet.",
      hint: "Run `fulcrum db migrate` to apply all pending migrations.",
    };
  }

  const latest = rows[0]!;
  return {
    check: "db.migrationVersion",
    status: "pass",
    detail: `Current migration: v${latest.version} — ${latest.name} (direction: ${latest.direction})`,
  };
}

/**
 * db.canRunOnCurrentBinary — checks the DB's max applied version against
 * the compile-time MAX_KNOWN_MIGRATION_VERSION.
 *
 * If DB version > binary's known max → binary is outdated; refuse to proceed.
 *
 * @param schemaMigrationRepo — inject from needle-di container.
 */
export async function dbCanRunOnCurrentBinary(
  schemaMigrationRepo: SchemaMigrationRepository,
): Promise<DoctorCheckResult> {
  const rows = await schemaMigrationRepo.findAll({
    orderBy: { version: "DESC" },
    limit: 1,
  });

  if (rows.length === 0) {
    // No migrations applied — no version conflict possible.
    return {
      check: "db.canRunOnCurrentBinary",
      status: "pass",
      detail: "No migrations applied; no version conflict.",
    };
  }

  const dbMaxVersion = rows[0]!.version ?? 0;

  if (dbMaxVersion > MAX_KNOWN_MIGRATION_VERSION) {
    return {
      check: "db.canRunOnCurrentBinary",
      status: "fail",
      detail:
        `DB schema version (${dbMaxVersion}) exceeds binary's known max ` +
        `(${MAX_KNOWN_MIGRATION_VERSION}). The binary is out of date.`,
      hint:
        "Upgrade the fulcrum binary to the latest version, or downgrade the DB " +
        "schema with `fulcrum db migrate --target-version <N> --force`.",
    };
  }

  return {
    check: "db.canRunOnCurrentBinary",
    status: "pass",
    detail:
      `DB schema v${dbMaxVersion} ≤ binary max v${MAX_KNOWN_MIGRATION_VERSION}. OK.`,
  };
}
