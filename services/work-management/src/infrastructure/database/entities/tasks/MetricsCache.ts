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

import { Sprint } from "./Sprint.ts";

@Entity("metrics_cache")
@Index("metrics_cache_project_sprint_date", ["projectId", "sprint", "date"])
@Unique("metrics_cache_project_sprint_date_unique", ["projectId", "sprint", "date"])
export class MetricsCache {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", name: "project_id" })
  projectId!: string;

  @ManyToOne(() => Sprint, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "sprint_id" })
  sprint?: Sprint | null;

  @Column({ type: "date" })
  date!: Date;

  @Column({ type: "integer", name: "started_count", default: 0 })
  startedCount: number = 0;

  @Column({ type: "integer", name: "completed_count", default: 0 })
  completedCount: number = 0;

  @Column({ type: "integer", name: "blocked_count", default: 0 })
  blockedCount: number = 0;

  @Column({ type: "integer", name: "points_completed", default: 0 })
  pointsCompleted: number = 0;

  @Column({ type: "integer", name: "points_remaining", default: 0 })
  pointsRemaining: number = 0;

  @Column({ type: "integer", name: "wip_count", default: 0 })
  wipCount: number = 0;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;

  // task workflow columns added by Migration20260505100000 (HIGH-01 fix)
  @Column({ type: "varchar", name: "scope_type", default: "sprint" })
  scopeType: "sprint" | "project" | "epic" | "workspace" = "sprint";

  @Column({ type: "integer", name: "points_total", default: 0 })
  pointsTotal: number = 0;

  @Column({ type: "integer", name: "tasks_total", default: 0 })
  tasksTotal: number = 0;

  @Column({ type: "jsonb", name: "status_counts", default: () => "'{}'" })
  statusCounts: Record<string, number> = {};
}
