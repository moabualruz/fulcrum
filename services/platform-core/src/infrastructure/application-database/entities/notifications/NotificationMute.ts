/**
 * NotificationMute entity — notifications domain (Pillar 12).
 */

import {
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  JoinColumn,
} from "typeorm";
import { Org } from "../auth/Org.ts";

@Entity("notification_mutes")
@Unique("uq_notification_mutes_user_subject", ["userId", "subjectKind", "subjectId"])
export class NotificationMute {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ name: "user_id" })
  userId!: string;

  @Column({ name: "subject_kind" })
  subjectKind!: string;

  @Column({ name: "subject_id" })
  subjectId!: string;

  /** null = muted permanently; Date = muted until this timestamp. */
  @Column({ type: "timestamptz", name: "muted_until", nullable: true })
  mutedUntil: Date | null = null;
}
