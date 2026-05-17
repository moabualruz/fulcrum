/**
 * PushSubscription entity — notifications domain (Pillar 12).
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

@Entity("push_subscriptions")
@Unique("uq_push_subscriptions_user_endpoint", ["userId", "endpoint"])
export class PushSubscription {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar", name: "user_id" })
  userId!: string;

  /** Full push endpoint URL (may be very long). */
  @Column({ type: "text" })
  endpoint!: string;

  /** ECDH public key (base64url). */
  @Column({ type: "text" })
  p256dh!: string;

  /** Authentication secret (base64url). */
  @Column({ type: "text" })
  auth!: string;

  @Column({ type: "text", name: "user_agent", nullable: true })
  userAgent: string | null = null;
}
