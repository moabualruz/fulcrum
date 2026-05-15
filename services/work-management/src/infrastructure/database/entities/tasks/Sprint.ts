import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import type { SprintStatusValue } from "./schemas.ts";

export enum SprintStatus {
  planned = "planned",
  active = "active",
  completed = "completed",
}

export interface MetricsSnapshot {
  capacity_points: number | null;
  completed_points: number;
  total_tasks: number;
  completed_tasks: number;
  velocity: number;
}

@Entity("sprints")
@Index("sprints_org_project_status", ["org", "projectId", "status"])
// Expression index: CREATE UNIQUE INDEX "sprints_one_active_per_project" ON "sprints" ("project_id") WHERE "status" = 'active'
@Index()
export class Sprint {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar", name: "project_id" })
  projectId!: string;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "text", nullable: true })
  goal: string | null = null;

  @Column({ type: "date", name: "start_date" })
  startDate!: Date;

  @Column({ type: "date", name: "end_date" })
  endDate!: Date;

  // Note: check constraint "status in ('planned','active','completed')" — handle in migration
  @Column({ type: "varchar", default: SprintStatus.planned })
  status: SprintStatusValue = SprintStatus.planned;

  @Column({ type: "integer", name: "capacity_points", nullable: true })
  capacityPoints: number | null = null;

  @Column({ type: "timestamptz", name: "closed_at", nullable: true })
  closedAt: Date | null = null;

  @Column({ type: "jsonb", name: "metrics_snapshot", nullable: true })
  metricsSnapshot: MetricsSnapshot | null = null;

  @Column({ type: "varchar", name: "retro_doc_id", nullable: true })
  retroDocId: string | null = null;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;

  // task workflow columns added by Migration20260505100000
  @Column({ type: "jsonb", name: "retrospective_notes", nullable: true })
  retrospectiveNotes: object | null = null;

  @Column({ type: "jsonb", name: "closed_summary", nullable: true })
  closedSummary: object | null = null;
}
