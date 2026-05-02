/**
 * SchemaMigration entity — Fulcrum migration audit ledger.
 *
 * Mirrors MikroORM's own `mikro_orm_migrations` ledger but adds:
 *   - `checksum`   SHA-256 of the migration file at apply-time.
 *   - `direction`  'up' | 'down' — most-recent operation on this migration.
 *
 * MikroORM's ledger remains authoritative for "is this migration applied?"
 * (consulted by getMigrator()). This table is Fulcrum's audit + safety layer.
 *
 * Not tenant-scoped — schema_migrations is a system-level table.
 *
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 * C9: Entity at src/db/entities/SchemaMigration.ts.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  Enum,
} from "@mikro-orm/decorators/es";
import { SchemaMigrationRepository } from "../repositories/SchemaMigrationRepository.ts";

export type MigrationDirection = "up" | "down";

@Entity({ tableName: "schema_migrations", repository: () => SchemaMigrationRepository })
export class SchemaMigration {
  /**
   * Migration version — bigint PRIMARY KEY, caller-supplied.
   *
   * Derived from the numeric timestamp portion of the migration class name,
   * e.g. "Migration20260501104413_auth" → 20260501104413.
   *
   * Caller must pass this value explicitly when creating a SchemaMigration row.
   * Using a timestamp-derived bigint (not serial/autoincrement) preserves version
   * semantics: version ordering matches chronological migration order, and doctor
   * checks can compare DB max-version against the compile-time constant in
   * doctor-checks.ts without relying on serial offsets.
   *
   * NOT optional — the caller (MigratorService#recordResults) always supplies it.
   */
  @PrimaryKey({ type: "bigint", autoincrement: false })
  version!: number;

  /**
   * Full migration class name, e.g. "Migration20260501104413_auth".
   * Must be unique — a single migration class produces at most one ledger row.
   */
  @Property({ type: "string", unique: true })
  name!: string;

  /** Timestamp when this direction was applied. */
  @Property({ type: "datetime", fieldName: "applied_at", defaultRaw: "now()" })
  appliedAt!: Date;

  /**
   * SHA-256 hex digest of the migration file content at apply-time.
   * Doctor checks compare this against the on-disk file to detect
   * unauthorised edits post-apply.
   */
  @Property({ type: "string" })
  checksum!: string;

  /** Most-recent operation on this migration row: 'up' applied, 'down' reverted. */
  @Enum({ items: () => ["up", "down"] as const, fieldName: "direction" })
  direction!: MigrationDirection;
}
