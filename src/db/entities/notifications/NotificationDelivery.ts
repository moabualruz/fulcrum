/**
 * NotificationDelivery entity — notifications domain (Pillar 12).
 *
 * Tracks each channel dispatch attempt (email, webhook, slack, etc.).
 *
 * C2: Composite (org_id, user_id, channel, status) index.
 * C7: MikroORM v7 ES Stage-3 decorator pattern.
 * C9: src/db/entities/notifications/NotificationDelivery.ts
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

export enum DeliveryStatus {
  Pending = "pending",
  Sent = "sent",
  Failed = "failed",
  Retrying = "retrying",
  Suppressed = "suppressed",
}

@Entity({ tableName: "notification_deliveries" })
@Index({ name: "idx_nd_org_user_channel_status", properties: ["org", "userId", "channel", "status"] })
@Index({ name: "idx_nd_retry_after", properties: ["retryAfter"] })
export class NotificationDelivery {
  [OptionalProps]?: "status" | "attemptCount" | "payload" | "createdAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  /** FK → notification_rules(id). Cascade delete. */
  @Property({ type: "uuid", fieldName: "rule_id" })
  ruleId!: string;

  /** FK → user_notifications(id). Nullable — delivery may exist without in-app notif. */
  @Property({ type: "uuid", fieldName: "notification_id", nullable: true })
  notificationId: string | null = null;

  @Property({ type: "uuid", fieldName: "user_id" })
  userId!: string;

  @Property({ type: "string" })
  channel!: string;

  @Enum({
    items: () => DeliveryStatus,
    fieldName: "status",
    default: DeliveryStatus.Pending,
  })
  status: DeliveryStatus = DeliveryStatus.Pending;

  @Property({ type: "integer", fieldName: "attempt_count", default: 0 })
  attemptCount: number = 0;

  @Property({ type: "text", fieldName: "last_error", nullable: true })
  lastError: string | null = null;

  @Property({ type: "json", fieldName: "payload", defaultRaw: "'{}'::jsonb" })
  payload: Record<string, unknown> = {};

  @Property({ type: "datetime", fieldName: "sent_at", nullable: true })
  sentAt: Date | null = null;

  @Property({ type: "datetime", fieldName: "retry_after", nullable: true })
  retryAfter: Date | null = null;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
