/**
 * NotificationRule entity — flags domain (Pillar 12: Notifications stub).
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  JoinColumn,
} from "typeorm";
import { Org } from "../auth/Org.ts";

@Entity("notification_rules")
@Index("idx_notification_rules_org_active_subject", ["org", "active", "subjectKind"])
export class NotificationRule {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org)
  @JoinColumn({ name: "org_id" })
  org!: Org;

  /** Entity kind (e.g. "task", "doc") this rule matches. */
  @Column({ name: "subject_kind" })
  subjectKind!: string;

  @Column({ type: "boolean" })
  active: boolean = true;
}
