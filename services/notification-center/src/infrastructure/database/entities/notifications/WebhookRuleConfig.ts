/**
 * WebhookRuleConfig entity — notifications domain (Pillar 12).
 */

import {
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  JoinColumn,
} from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";

@Entity("webhook_rule_configs")
@Unique("uq_webhook_rule_configs_rule", ["ruleId"])
export class WebhookRuleConfig {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ name: "rule_id" })
  ruleId!: string;

  @Column({ type: "text" })
  url!: string;

  @Column({ type: "text", name: "encrypted_secret" })
  encryptedSecret!: string;
}
