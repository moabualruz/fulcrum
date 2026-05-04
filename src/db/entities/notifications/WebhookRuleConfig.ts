/**
 * WebhookRuleConfig entity — notifications domain (Pillar 12).
 *
 * Stores the outbound webhook URL + HMAC secret for a NotificationRule.
 * One-to-one with a notification rule (UNIQUE on rule_id).
 *
 * C2: org_id FK cascade.
 * C7: MikroORM v7 ES Stage-3 decorator pattern.
 */

import {
  Entity,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from "@mikro-orm/decorators/es";
import { Org } from "../auth/Org.ts";

@Entity({ tableName: "webhook_rule_configs" })
@Unique({ name: "uq_webhook_rule_configs_rule", properties: ["ruleId"] })
export class WebhookRuleConfig {
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

  /** Destination webhook URL. */
  @Property({ type: "text" })
  url!: string;

  /** AES-256-GCM encrypted HMAC secret (base64url-encoded ciphertext). */
  @Property({ type: "text", fieldName: "encrypted_secret" })
  encryptedSecret!: string;
}
