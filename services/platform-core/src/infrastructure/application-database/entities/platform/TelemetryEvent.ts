/**
 * TelemetryEvent entity — platform domain (Pillar 17 cross-cutting).
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  JoinColumn,
} from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { User } from "@identity-access/infrastructure/database/entities/auth/User.ts";

@Entity("telemetry_events")
@Index() // expression: CREATE INDEX "idx_telemetry_events_org_occurred" ON "telemetry_events" ("org_id", "occurred_at" DESC)
@Index("idx_telemetry_events_org_user_kind", ["org", "user", "kind"])
export class TelemetryEvent {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "user_id" })
  user?: User;

  @Column()
  kind!: string;

  @Column({ type: "jsonb" })
  payload: Record<string, unknown> = {};

  @Column({ type: "timestamptz", name: "occurred_at", default: () => "now()" })
  occurredAt!: Date;
}
