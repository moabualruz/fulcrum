import { EntitySchema } from "typeorm";

export type TaskRecurrenceTrigger = "schedule" | "on_complete";

export interface WorkManagementTaskRecurrenceRule {
  id: string;
  orgId: string;
  sourceTaskId: string;
  triggerType: TaskRecurrenceTrigger;
  cronExpression: string | null;
  intervalDays: number | null;
  timezone: string;
  includeSubtasks: boolean;
  maxOccurrences: number | null;
  occurrencesCreated: number;
  enabled: boolean;
  templateData: Record<string, unknown>;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export const WorkManagementTaskRecurrenceRuleEntity = new EntitySchema<WorkManagementTaskRecurrenceRule>({
  name: "WorkManagementTaskRecurrenceRule",
  tableName: "fulcrum_task_recurrence_rules",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    sourceTaskId: { name: "source_task_id", type: "varchar", length: 128 },
    triggerType: { name: "trigger_type", type: "varchar", length: 80 },
    cronExpression: { name: "cron_expression", type: "varchar", length: 255, nullable: true },
    intervalDays: { name: "interval_days", type: "int", nullable: true },
    timezone: { type: "varchar", length: 80, default: "UTC" },
    includeSubtasks: { name: "include_subtasks", type: "boolean", default: false },
    maxOccurrences: { name: "max_occurrences", type: "int", nullable: true },
    occurrencesCreated: { name: "occurrences_created", type: "int", default: 0 },
    enabled: { type: "boolean", default: true },
    templateData: { name: "template_data", type: "jsonb", default: {} },
    nextRunAt: { name: "next_run_at", type: "timestamptz", nullable: true },
    lastRunAt: { name: "last_run_at", type: "timestamptz", nullable: true },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
    updatedAt: {
      name: "updated_at",
      type: "timestamptz",
      updateDate: true,
    },
  },
  indices: [
    { name: "fulcrum_task_recurrence_rules_org_task_idx", columns: ["orgId", "sourceTaskId"] },
    { name: "fulcrum_task_recurrence_rules_next_run_idx", columns: ["nextRunAt", "enabled"] },
  ],
});

export const FULCRUM_TASK_RECURRENCE_ENTITIES = [WorkManagementTaskRecurrenceRuleEntity];
