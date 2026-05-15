/**
 * SchemaMigration entity — Fulcrum migration audit ledger.
 */

import {
  Entity,
  PrimaryColumn,
  Column,
} from "typeorm";

export type MigrationDirection = "up" | "down";

@Entity("schema_migrations")
export class SchemaMigration {
  @PrimaryColumn({ type: "bigint" })
  version!: number;

  @Column({ unique: true })
  name!: string;

  @Column({ type: "timestamptz", name: "applied_at", default: () => "now()" })
  appliedAt!: Date;

  @Column()
  checksum!: string;

  @Column({ type: "enum", enum: ["up", "down"], name: "direction" })
  direction!: MigrationDirection;
}
