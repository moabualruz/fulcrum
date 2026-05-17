/**
 * SchemaMigration entity — Fulcrum migration audit ledger.
 */

import {
  Entity,
  PrimaryColumn,
  Column,
} from "typeorm";

export type MigrationDirection = "up" | "down";

@Entity("fulcrum_schema_migrations")
export class SchemaMigration {
  @PrimaryColumn({ type: "bigint" })
  version!: number;

  @Column({ type: "varchar", unique: true })
  name!: string;

  @Column({ type: "timestamptz", name: "applied_at", default: () => "now()" })
  appliedAt!: Date;

  @Column({ type: "varchar" })
  checksum!: string;

  @Column({ type: "enum", enum: ["up", "down"], name: "direction" })
  direction!: MigrationDirection;
}
