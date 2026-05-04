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
 * C10: stub contains only the index-axis columns (id + org FK + active). All
 *      domain-specific fields deferred to Pillar 10 own-migration in its wave:
 *        - url: string        — outbound endpoint (primary dispatch field)
 *        - events: string[]   — event-verb filter list
 *        - secret: string     — HMAC shared secret for payload signing
 *        - createdAt: Date    — audit timestamp
 *      Non-id @Property count: 1 (active). Total non-id columns: 2 (org FK + active).
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
}
