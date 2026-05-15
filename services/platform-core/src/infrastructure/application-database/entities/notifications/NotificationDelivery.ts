/**
 * NotificationDelivery entity — notifications domain (Pillar 12).
 */

import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from "typeorm";
import { Org } from "../auth/Org.ts";

export enum DeliveryStatus {
  Pending = "pending",
  Sent = "sent",
  Failed = "failed",
  Retrying = "retrying",
  Suppressed = "suppressed",
}

@Entity("notification_deliveries")
@Index("idx_nd_org_user_channel_status", ["org", "userId", "channel", "status"])
@Index("idx_nd_retry_after", ["retryAfter"])
export class NotificationDelivery {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ name: "rule_id" })
  ruleId!: string;

  @Column({ name: "notification_id", nullable: true })
  notificationId: string | null = null;

  @Column({ name: "user_id" })
  userId!: string;

  @Column()
  channel!: string;

  @Column({ type: "enum", enum: DeliveryStatus, name: "status", default: DeliveryStatus.Pending })
  status: DeliveryStatus = DeliveryStatus.Pending;

  @Column({ type: "integer", name: "attempt_count", default: 0 })
  attemptCount: number = 0;

  @Column({ type: "text", name: "last_error", nullable: true })
  lastError: string | null = null;

  @Column({ type: "jsonb", name: "payload", default: () => "'{}'" })
  payload: Record<string, unknown> = {};

  @Column({ type: "timestamptz", name: "sent_at", nullable: true })
  sentAt: Date | null = null;

  @Column({ type: "timestamptz", name: "retry_after", nullable: true })
  retryAfter: Date | null = null;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
}
