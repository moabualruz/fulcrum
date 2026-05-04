/**
 * Webhook entity — outbound webhook endpoints (Pillar 13, Issue 07).
 *
 * Stores the registration for each outbound webhook. The HMAC `secret` is
 * always stored encrypted (nacl.secretbox via vault.ts). On `list` the
 * caller sees `"****"`; the raw secret is only decrypted internally for
 * HMAC signing — it is NEVER returned to callers.
 *
 * Table: webhooks
 * UNIQUE(org_id, name) — per Q22 composite indexes.
 *
 * C2: Composite (org_id, enabled) + (org_id, name) indexes.
 * C7: MikroORM v7 ES Stage-3 decorator pattern.
 * C9: src/db/entities/notifications/Webhook.ts
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

@Entity({ tableName: "webhooks" })
@Unique({ name: "uq_webhooks_org_name", properties: ["org", "name"] })
@Index({ name: "idx_webhooks_org_enabled", properties: ["org", "enabled"] })
export class Webhook {
  [OptionalProps]?: "eventsFilter" | "enabled" | "createdAt" | "updatedAt" | "lastDeliveryAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  /** Human-readable label, unique per org. */
  @Property({ type: "string" })
  name!: string;

  /** HTTPS destination for webhook events. */
  @Property({ type: "text" })
  url!: string;

  /**
   * AES/XSalsa20 encrypted HMAC secret (base64url ciphertext via vault.ts).
   * Never returned to callers; list returns "****".
   */
  @Property({ type: "text", fieldName: "encrypted_secret", nullable: true })
  encryptedSecret: string | null = null;

  /**
   * JSON array of event type filters. null = all events.
   * e.g. ["task.created", "run.completed"]
   */
  @Property({ type: "json", fieldName: "events_filter", nullable: true })
  eventsFilter: string[] | null = null;

  /** When false, no deliveries are attempted. */
  @Property({ type: "boolean", default: true })
  enabled: boolean = true;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt: Date = new Date();

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()", onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  /** Set by the dispatcher after each delivery attempt. */
  @Property({ type: "datetime", fieldName: "last_delivery_at", nullable: true })
  lastDeliveryAt: Date | null = null;
}
