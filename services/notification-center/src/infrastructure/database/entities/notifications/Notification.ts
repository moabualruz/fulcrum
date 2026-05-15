/**
 * Notification entity — notifications domain (Pillar 12).
 */

import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  JoinColumn,
} from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";

@Entity("user_notifications")
@Unique("uq_user_notifications_user_event_rule", ["userId", "eventId", "ruleId"])
@Index("idx_user_notifications_org_user_read", ["org", "userId", "readAt"])
@Index("idx_user_notifications_org_user_created", ["org", "userId", "createdAt"])
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar", name: "user_id" })
  userId!: string;

  @Column({ type: "varchar", name: "rule_id", nullable: true })
  ruleId: string | null = null;

  @Column({ type: "varchar", name: "event_id" })
  eventId!: string;

  @Column({ type: "varchar" })
  title!: string;

  @Column({ type: "text", default: "" })
  body: string = "";

  @Column({ type: "varchar", name: "entity_kind" })
  entityKind!: string;

  @Column({ type: "varchar", name: "entity_id" })
  entityId!: string;

  @Column({ type: "timestamptz", name: "read_at", nullable: true })
  readAt: Date | null = null;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
}
