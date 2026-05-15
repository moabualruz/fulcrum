import type { TaskRecurrenceTrigger } from "@work-management/infrastructure/database/task-recurrence.entities.ts";

export class TaskRecurrenceListQueryDto {
  orgId!: string;
  taskId!: string;
}

export class TaskRecurrenceCreateDto extends TaskRecurrenceListQueryDto {
  triggerType!: TaskRecurrenceTrigger;
  cronExpression?: string;
  includeSubtasks?: boolean;
  intervalDays?: number;
  maxOccurrences?: number;
  timezone?: string;
}

export class TaskRecurrenceDeleteParamsDto {
  ruleId!: string;
}

export class TaskRecurrenceDeleteQueryDto {
  orgId!: string;
}
