/**
 * PushSubscription entity — notifications domain (Pillar 12).
 *
 * VAPID Web Push subscription per (user, endpoint) pair.
 * p256dh and auth are base64url-encoded strings.
 *
 * C2: org_id FK cascade; UNIQUE (user_id, endpoint).
 * C7: MikroORM v7 ES Stage-3 decorator pattern.
 */

import {
  Entity,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";
import { Org } from "../auth/Org.ts";

@Entity({ tableName: "push_subscriptions" })
@Unique({ name: "uq_push_subscriptions_user_endpoint", properties: ["userId", "endpoint"] })
export class PushSubscription {
  [OptionalProps]?: "userAgent";

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

  /** Full push endpoint URL (may be very long). */
  @Property({ type: "text" })
  endpoint!: string;

  /** ECDH public key (base64url). */
  @Property({ type: "text" })
  p256dh!: string;

  /** Authentication secret (base64url). */
  @Property({ type: "text" })
  auth!: string;

  @Property({ type: "text", fieldName: "user_agent", nullable: true })
  userAgent: string | null = null;
}
