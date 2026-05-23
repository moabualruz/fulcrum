import { randomUUID } from "node:crypto";

import { DataSource } from "typeorm";

import {
  WorkManagementTaskRecurrenceRuleEntity,
  type TaskRecurrenceTrigger,
  type WorkManagementTaskRecurrenceRule,
} from "@work-management/infrastructure/database/task-recurrence.entities.ts";
import {
  FulcrumProjectEntity,
  FulcrumTaskEntity,
  type FulcrumTask,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

export interface TaskRecurrencePublicRow {
  id: string;
  orgId: string;
  sourceTaskId: string;
  triggerType: TaskRecurrenceTrigger;
  cronExpression: string | null;
  intervalDays: number | null;
  timezone: string;
  includeSubtasks: boolean;
  enabled: boolean;
  occurrencesCreated: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
  maxOccurrences: number | null;
  createdAt: string | null;
}

export class TaskRecurrenceNotFoundError extends Error {}
export class TaskRecurrenceValidationError extends Error {}

export class TaskRecurrenceStore {
  constructor(private readonly dataSource: DataSource) {}

  async list(input: { orgId: string; taskId: string }): Promise<TaskRecurrencePublicRow[]> {
    await this.requireTask(input.orgId, input.taskId);
    const rows = await this.ruleRepository().find({
      where: { orgId: input.orgId, sourceTaskId: input.taskId },
      order: { createdAt: "DESC", id: "ASC" },
    });
    return rows.map(serializeRule);
  }

  async create(input: {
    orgId: string;
    taskId: string;
    triggerType: TaskRecurrenceTrigger;
    cronExpression?: string | null;
    intervalDays?: number | null;
    timezone?: string | null;
    includeSubtasks?: boolean;
    maxOccurrences?: number | null;
  }): Promise<TaskRecurrencePublicRow> {
    if (input.triggerType === "schedule" && !input.cronExpression && !input.intervalDays) {
      throw new TaskRecurrenceValidationError("Schedule recurrence requires cronExpression or intervalDays.");
    }
    if (input.cronExpression && !isValidCronExpression(input.cronExpression)) {
      throw new TaskRecurrenceValidationError("cronExpression must be a valid 5-field cron schedule.");
    }
    if (input.intervalDays !== undefined && input.intervalDays !== null && (!Number.isInteger(input.intervalDays) || input.intervalDays < 1)) {
      throw new TaskRecurrenceValidationError("intervalDays must be a positive integer.");
    }
    const task = await this.requireTask(input.orgId, input.taskId);
    const saved = await this.ruleRepository().save({
      id: randomUUID(),
      orgId: input.orgId,
      sourceTaskId: input.taskId,
      triggerType: input.triggerType,
      cronExpression: input.cronExpression ?? null,
      intervalDays: input.intervalDays ?? null,
      timezone: input.timezone ?? "UTC",
      includeSubtasks: input.includeSubtasks ?? false,
      maxOccurrences: input.maxOccurrences ?? null,
      occurrencesCreated: 0,
      enabled: true,
      templateData: {
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        points: task.points,
      },
      nextRunAt: calculateNextRunAt(input),
      lastRunAt: null,
    });
    return serializeRule(saved);
  }

  async delete(input: { orgId: string; ruleId: string }): Promise<boolean> {
    const result = await this.ruleRepository().delete({ orgId: input.orgId, id: input.ruleId });
    return Number(result.affected ?? 0) > 0;
  }

  private async requireTask(orgId: string, taskId: string): Promise<FulcrumTask> {
    const task = await this.dataSource.getRepository(FulcrumTaskEntity).findOneBy({ id: taskId });
    if (!task || task.deletedAt) {
      throw new TaskRecurrenceNotFoundError(`Task ${taskId} not found.`);
    }
    const project = await this.dataSource.getRepository(FulcrumProjectEntity).findOneBy({ id: task.projectId });
    if (!project || project.workspaceId !== orgId) {
      throw new TaskRecurrenceNotFoundError(`Task ${taskId} not found.`);
    }
    return task;
  }

  private ruleRepository() {
    return this.dataSource.getRepository<WorkManagementTaskRecurrenceRule>(WorkManagementTaskRecurrenceRuleEntity);
  }
}

function calculateNextRunAt(input: {
  cronExpression?: string | null;
  intervalDays?: number | null;
}): Date | null {
  if (input.intervalDays) {
    const next = new Date();
    next.setDate(next.getDate() + input.intervalDays);
    return next;
  }
  if (input.cronExpression) return new Date();
  return null;
}

function isValidCronExpression(expression: string): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const ranges = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 7],
  ] as const;
  return fields.every((field, index) => {
    const range = ranges[index];
    if (!range) return false;
    return isValidCronField(field, range[0], range[1]);
  });
}

function isValidCronField(field: string, min: number, max: number): boolean {
  if (!field) return false;
  return field.split(",").every((part) => {
    const [range, step] = part.split("/");
    if (step !== undefined && (!/^\d+$/.test(step) || Number(step) < 1)) return false;
    if (!range || range === "*") return true;
    if (/^\d+$/.test(range)) {
      const value = Number(range);
      return value >= min && value <= max;
    }
    const bounds = range.split("-");
    if (bounds.length !== 2 || !bounds.every((value) => /^\d+$/.test(value))) return false;
    const [startRaw, endRaw] = bounds.map(Number);
    if (startRaw === undefined || endRaw === undefined) return false;
    const start = startRaw;
    const end = endRaw;
    return start >= min && end <= max && start <= end;
  });
}

function serializeRule(rule: WorkManagementTaskRecurrenceRule): TaskRecurrencePublicRow {
  return {
    id: rule.id,
    orgId: rule.orgId,
    sourceTaskId: rule.sourceTaskId,
    triggerType: rule.triggerType,
    cronExpression: rule.cronExpression ?? null,
    intervalDays: rule.intervalDays ?? null,
    timezone: rule.timezone,
    includeSubtasks: rule.includeSubtasks,
    enabled: rule.enabled,
    occurrencesCreated: rule.occurrencesCreated,
    nextRunAt: dateString(rule.nextRunAt ?? undefined),
    lastRunAt: dateString(rule.lastRunAt ?? undefined),
    maxOccurrences: rule.maxOccurrences ?? null,
    createdAt: dateString(rule.createdAt),
  };
}

function dateString(value: Date | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}
