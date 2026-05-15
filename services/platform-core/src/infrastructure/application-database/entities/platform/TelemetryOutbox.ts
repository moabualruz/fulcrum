/**
 * TelemetryOutbox entity — platform domain (Pillar 17 cross-cutting).
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
} from "typeorm";

export type TelemetryOutboxStatus = "queued" | "retrying" | "sent" | "dead";

@Entity("telemetry_outbox")
@Index("idx_telemetry_outbox_status", ["status"])
export class TelemetryOutbox {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "text", name: "batch_json" })
  batchJson!: string;

  @Column({ type: "integer", default: 0 })
  attempts: number = 0;

  @Column({ type: "timestamptz", name: "last_attempt_at", nullable: true })
  lastAttemptAt: Date | null = null;

  @Column({ default: "queued" })
  status: TelemetryOutboxStatus = "queued";

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
}
