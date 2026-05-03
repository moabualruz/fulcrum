/**
 * WebhookDelivery entity — delivery attempt log (Pillar 13, Issue 07).
 *
 * Each row represents one delivery attempt for a given event to a webhook endpoint.
 * Cascades delete when the parent Webhook row is deleted.
 *
 * Table: webhook_deliveries
 * Composite indexes per Q22.
 *
 * C2: (org_id, webhook_id, status) + (org_id, next_retry_at) indexes.
 * C7: MikroORM v7 ES Stage-3 decorator pattern.
 * C9: src/db/entities/notifications/WebhookDelivery.ts
 */

import {
  Entity,
  Enum,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";
import { Org } from "../auth/Org.ts";
import { Webhook } from "./Webhook.ts";

export enum WebhookDeliveryStatus {
  Pending = "pending",
  Delivered = "delivered",
  Failed = "failed",
  Retrying = "retrying",
}

@Entity({ tableName: "webhook_deliveries" })
@Index({ name: "idx_wd_org_webhook_status", properties: ["org", "webhook", "status"] })
@Index({ name: "idx_wd_next_retry", properties: ["nextRetryAt"] })
export class WebhookDelivery {
  [OptionalProps]?: "attempt" | "payload" | "responseCode" | "error" | "nextRetryAt" | "createdAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  @ManyToOne(() => Webhook, {
    fieldName: "webhook_id",
    nullable: false,
    deleteRule: "cascade",
  })
  webhook!: Webhook;

  /** FK → events(id). The event that triggered this delivery. */
  @Property({ type: "uuid", fieldName: "event_id", nullable: true })
  eventId: string | null = null;

  @Enum({
    items: () => WebhookDeliveryStatus,
    fieldName: "status",
    default: WebhookDeliveryStatus.Pending,
  })
  status: WebhookDeliveryStatus = WebhookDeliveryStatus.Pending;

  /** Attempt counter (1-indexed). */
  @Property({ type: "integer", default: 1 })
  attempt: number = 1;

  /** JSON payload sent in the POST body. */
  @Property({ type: "json", nullable: true })
  payload: Record<string, unknown> | null = null;

  /** HTTP response status code from the destination. */
  @Property({ type: "integer", fieldName: "response_code", nullable: true })
  responseCode: number | null = null;

  /** Error message on failure. */
  @Property({ type: "text", nullable: true })
  error: string | null = null;

  /** When to retry (null = no retry scheduled). */
  @Property({ type: "datetime", fieldName: "next_retry_at", nullable: true })
  nextRetryAt: Date | null = null;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt: Date = new Date();
}
