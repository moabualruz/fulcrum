import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";

import { Org } from "../auth/Org.ts";

@Entity({ tableName: "task_recurrence_rules" })
@Index({
  name: "task_recurrence_rules_next_run_enabled",
  expression:
    'CREATE INDEX "task_recurrence_rules_next_run_enabled" ON "task_recurrence_rules" ("next_run_at") WHERE "enabled" = true',
})
export class TaskRecurrenceRule {
  [OptionalProps]?:
    | "createdAt"
    | "cronExpression"
    | "intervalDays"
    | "startDate"
    | "endDate"
    | "maxOccurrences"
    | "occurrencesCreated"
    | "nextRunAt"
    | "lastRunAt"
    | "enabled"
    | "includeSubtasks"
    | "timezone";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  @Property({ type: "uuid", fieldName: "source_task_id" })
  sourceTaskId!: string;

  @Property({ type: "string", fieldName: "trigger_type" })
  triggerType!: string;

  @Property({ type: "string", fieldName: "cron_expression", nullable: true })
  cronExpression: string | null = null;

  @Property({ type: "integer", fieldName: "interval_days", nullable: true })
  intervalDays: number | null = null;

  @Property({ type: "string" })
  timezone: string = "UTC";

  @Property({ type: "json", fieldName: "template_data", nullable: true })
  templateData: object | null = null;

  @Property({ type: "boolean", fieldName: "include_subtasks", default: false })
  includeSubtasks: boolean = false;

  @Property({ type: "date", fieldName: "start_date", nullable: true })
  startDate: Date | null = null;

  @Property({ type: "date", fieldName: "end_date", nullable: true })
  endDate: Date | null = null;

  @Property({ type: "integer", fieldName: "max_occurrences", nullable: true })
  maxOccurrences: number | null = null;

  @Property({ type: "integer", fieldName: "occurrences_created", default: 0 })
  occurrencesCreated: number = 0;

  @Property({ type: "datetime", fieldName: "next_run_at", nullable: true })
  nextRunAt: Date | null = null;

  @Property({ type: "datetime", fieldName: "last_run_at", nullable: true })
  lastRunAt: Date | null = null;

  @Property({ type: "boolean", default: true })
  enabled: boolean = true;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
