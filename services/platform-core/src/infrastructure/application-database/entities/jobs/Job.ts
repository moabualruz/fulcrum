/**
 * Job entity — jobs domain (Pillar 12 stub).
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

@Entity("jobs")
@Index("idx_jobs_org_status_scheduled", ["org", "status", "scheduledFor"])
export class Job {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org)
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ name: "project_id", nullable: true })
  projectId?: string | null = null;

  @Column({ default: "default" })
  queue: string = "default";

  @Column({ default: "generic" })
  kind: string = "generic";

  @Column({ type: "jsonb", default: () => "'{}'" })
  payload: Record<string, unknown> = {};

  @Column()
  status: string = "pending";

  @Column({ type: "integer", name: "max_attempts", default: 3 })
  maxAttempts: number = 3;

  @Column({ type: "timestamptz", name: "available_at", default: () => "now()" })
  availableAt!: Date;

  @Column({ type: "timestamptz", name: "scheduled_for", default: () => "now()" })
  scheduledFor!: Date;
}
