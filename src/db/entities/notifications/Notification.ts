/**
 * Notification entity — notifications domain (Pillar 12).
 *
 * One row per (user, event, rule) match — the in-app notification.
 *
 * C2: Composite (org_id, user_id, read_at) + (org_id, user_id, created_at) indexes.
 * C7: MikroORM v7 ES Stage-3 decorator pattern.
 * C9: src/db/entities/notifications/Notification.ts
 */

import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";
import { Org } from "../auth/Org.ts";

@Entity({ tableName: "user_notifications" })
@Unique({ name: "uq_user_notifications_user_event_rule", properties: ["userId", "eventId", "ruleId"] })
@Index({ name: "idx_user_notifications_org_user_read", properties: ["org", "userId", "readAt"] })
@Index({ name: "idx_user_notifications_org_user_created", properties: ["org", "userId", "createdAt"] })
export class Notification {
  [OptionalProps]?: "body" | "readAt" | "createdAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  @Property({ type: "uuid", fieldName: "user_id" })
  userId!: string;

  /** FK → notification_rules(id). Nullable so rows survive rule deletion. */
  @Property({ type: "uuid", fieldName: "rule_id", nullable: true })
  ruleId: string | null = null;

  /** FK → events(id). Cascade delete with the triggering event. */
  @Property({ type: "uuid", fieldName: "event_id" })
  eventId!: string;

  @Property({ type: "string" })
  title!: string;

  @Property({ type: "text", default: "" })
  body: string = "";

  @Property({ type: "string", fieldName: "entity_kind" })
  entityKind!: string;

  @Property({ type: "uuid", fieldName: "entity_id" })
  entityId!: string;

  @Property({ type: "datetime", fieldName: "read_at", nullable: true })
  readAt: Date | null = null;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
