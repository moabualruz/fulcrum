/**
 * WebhookSubscription entity — flags domain (Pillar 10: Webhooks stub).
 *
 * Per-org outbound webhook subscription. Rows are written only when the
 * `outbound-webhooks` feature flag is enabled.
 *
 * C2: Composite (org_id, active) index — dispatch loop scans active rows per org.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 * C8: @Entity({ repository }) wires WebhookSubscriptionRepository.
 * Secret values are encrypted by src/application/webhooks/encryption.ts before
 * persistence and are never projected back to callers as plaintext.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Index,
} from "@mikro-orm/decorators/es";
import { Org } from "../auth/Org.ts";
import { WebhookSubscriptionRepository } from "../../repositories/flags/WebhookSubscriptionRepository.ts";

@Entity({
  tableName: "webhook_subscriptions",
  repository: () => WebhookSubscriptionRepository,
})
@Index({
  name: "idx_webhook_subscriptions_org_active",
  properties: ["org", "active"],
})
export class WebhookSubscription {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  @Property({ type: "boolean" })
  active: boolean = true;

  @Property({ type: "text" })
  url!: string;

  @Property({ type: "json" })
  events: string[] = [];

  @Property({ type: "text", fieldName: "encrypted_secret" })
  encryptedSecret!: string;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt: Date = new Date();

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()", onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
