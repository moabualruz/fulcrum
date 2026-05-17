/**
 * Webhook entity — outbound webhook endpoints (Pillar 13, Issue 07).
 */

import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  UpdateDateColumn,
  JoinColumn,
} from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";

@Entity("webhooks")
@Unique("uq_webhooks_org_name", ["org", "name"])
@Index("idx_webhooks_org_enabled", ["org", "enabled"])
export class Webhook {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "text" })
  url!: string;

  @Column({ type: "text", name: "encrypted_secret", nullable: true })
  encryptedSecret: string | null = null;

  @Column({ type: "jsonb", name: "events_filter", nullable: true })
  eventsFilter: string[] | null = null;

  @Column({ type: "boolean", default: true })
  enabled: boolean = true;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt: Date = new Date();

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt: Date = new Date();

  @Column({ type: "timestamptz", name: "last_delivery_at", nullable: true })
  lastDeliveryAt: Date | null = null;
}
