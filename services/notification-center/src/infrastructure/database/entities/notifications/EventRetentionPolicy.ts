/**
 * EventRetentionPolicy entity — notifications domain (Pillar 12).
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

@Entity("event_retention_policy")
@Unique("uq_event_retention_policy_org_project", ["org", "projectId"])
export class EventRetentionPolicy {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  /** null = org-wide policy; UUID = project-scoped override. */
  @Column({ name: "project_id", nullable: true })
  projectId: string | null = null;

  @Column({ type: "integer", name: "retain_days", default: 0 })
  retainDays: number = 0;
}
