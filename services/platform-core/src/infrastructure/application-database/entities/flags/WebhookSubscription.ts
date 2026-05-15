/**
 * WebhookSubscription entity — flags domain (Pillar 10: Webhooks stub).
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  UpdateDateColumn,
  JoinColumn,
} from "typeorm";
import { Org } from "../auth/Org.ts";

@Entity("webhook_subscriptions")
@Index("idx_webhook_subscriptions_org_active", ["org", "active"])
export class WebhookSubscription {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org)
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "boolean" })
  active: boolean = true;

  @Column({ type: "text" })
  url!: string;

  @Column({ type: "jsonb" })
  events: string[] = [];

  @Column({ type: "text", name: "encrypted_secret" })
  encryptedSecret!: string;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt: Date = new Date();

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt: Date = new Date();
}
