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
