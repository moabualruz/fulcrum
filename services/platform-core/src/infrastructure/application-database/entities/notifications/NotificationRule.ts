/**
 * NotificationRule entity — notifications domain (Pillar 12 full expansion).
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
import { Org } from "../auth/Org.ts";

@Entity("notification_rules")
@Unique("uq_notification_rules_user_name", ["userId", "name"])
@Index("notification_rules_org_user", ["org", "userId"])
@Index("notification_rules_org_enabled", ["org", "enabled"])
export class NotificationRule {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ name: "user_id", nullable: true })
  userId: string | null = null;

  @Column({ name: "subject_kind", nullable: true })
  subjectKind: string | null = null;

  @Column({ type: "boolean", name: "active", default: true })
  active: boolean = true;

  @Column({ nullable: true })
  name: string | null = null;

  @Column({ type: "jsonb", name: "event_pattern", nullable: true })
  eventPattern: Record<string, unknown> | null = null;

  @Column({ type: "simple-array", name: "channels", nullable: true })
  channels: string[] | null = null;

  @Column({ type: "boolean", name: "enabled", default: true })
  enabled: boolean = true;

  @Column({ type: "timestamptz", name: "created_at", nullable: true })
  createdAt: Date | null = null;

  @Column({ type: "timestamptz", name: "updated_at", nullable: true })
  updatedAt: Date | null = null;
}
