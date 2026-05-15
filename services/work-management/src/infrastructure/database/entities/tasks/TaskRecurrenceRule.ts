import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";

@Entity("task_recurrence_rules")
// Expression index: CREATE INDEX "task_recurrence_rules_next_run_enabled" ON "task_recurrence_rules" ("next_run_at") WHERE "enabled" = true
@Index()
export class TaskRecurrenceRule {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ name: "source_task_id" })
  sourceTaskId!: string;

  @Column({ name: "trigger_type" })
  triggerType!: string;

  @Column({ name: "cron_expression", nullable: true })
  cronExpression: string | null = null;

  @Column({ type: "integer", name: "interval_days", nullable: true })
  intervalDays: number | null = null;

  @Column({ default: "UTC" })
  timezone: string = "UTC";

  @Column({ type: "jsonb", name: "template_data", nullable: true })
  templateData: object | null = null;

  @Column({ type: "boolean", name: "include_subtasks", default: false })
  includeSubtasks: boolean = false;

  @Column({ type: "date", name: "start_date", nullable: true })
  startDate: Date | null = null;

  @Column({ type: "date", name: "end_date", nullable: true })
  endDate: Date | null = null;

  @Column({ type: "integer", name: "max_occurrences", nullable: true })
  maxOccurrences: number | null = null;

  @Column({ type: "integer", name: "occurrences_created", default: 0 })
  occurrencesCreated: number = 0;

  @Column({ type: "timestamptz", name: "next_run_at", nullable: true })
  nextRunAt: Date | null = null;

  @Column({ type: "timestamptz", name: "last_run_at", nullable: true })
  lastRunAt: Date | null = null;

  @Column({ type: "boolean", default: true })
  enabled: boolean = true;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
}
