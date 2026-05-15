/**
 * WebhookDelivery entity — delivery attempt log (Pillar 13, Issue 07).
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
import { Webhook } from "./Webhook.ts";

export enum WebhookDeliveryStatus {
  Pending = "pending",
  Delivered = "delivered",
  Failed = "failed",
  Retrying = "retrying",
}

@Entity("webhook_deliveries")
@Index("idx_wd_org_webhook_status", ["org", "webhook", "status"])
@Index("idx_wd_next_retry", ["nextRetryAt"])
export class WebhookDelivery {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @ManyToOne(() => Webhook, { onDelete: "CASCADE" })
  @JoinColumn({ name: "webhook_id" })
  webhook!: Webhook;

  @Column({ name: "event_id", nullable: true })
  eventId: string | null = null;

  @Column({ type: "enum", enum: WebhookDeliveryStatus, name: "status", default: WebhookDeliveryStatus.Pending })
  status: WebhookDeliveryStatus = WebhookDeliveryStatus.Pending;

  @Column({ type: "integer", default: 1 })
  attempt: number = 1;

  @Column({ type: "jsonb", nullable: true })
  payload: Record<string, unknown> | null = null;

  @Column({ type: "integer", name: "response_code", nullable: true })
  responseCode: number | null = null;

  @Column({ type: "text", nullable: true })
  error: string | null = null;

  @Column({ type: "timestamptz", name: "next_retry_at", nullable: true })
  nextRetryAt: Date | null = null;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt: Date = new Date();
}
