/**
 * WorkItemRecurrenceService.
 *
 * Manages TaskRecurrenceRule entities.
 * processDue() is called by graphile-worker; clones source task via WorkItemService.
 * onTaskComplete() triggers on_complete recurrence rules.
 */

import type { EntityManager } from "typeorm";

import { TaskRecurrenceRule } from "@work-management/infrastructure/database/entities/tasks/TaskRecurrenceRule.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";
import type { WorkItemService } from "@work-management/application/work-item-service.ts";

// ── Types ──────────────────────────────────────────────────────────────────────

export type TriggerType = "schedule" | "on_complete";

export interface RecurrenceConfig {
  triggerType: TriggerType;
  cronExpression?: string;
  intervalDays?: number;
  timezone?: string;
  includeSubtasks?: boolean;
  startDate?: Date;
  endDate?: Date;
  maxOccurrences?: number;
}

export interface RecurrenceRuleOutput {
  id: string;
  orgId: string;
  sourceTaskId: string;
  triggerType: string;
  cronExpression: string | null;
  intervalDays: number | null;
  timezone: string;
  enabled: boolean;
  occurrencesCreated: number;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  maxOccurrences: number | null;
  endDate: Date | null;
  createdAt: Date;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calculateNextRunAt(config: RecurrenceConfig): Date | null {
  if (config.intervalDays) {
    const next = new Date();
    next.setDate(next.getDate() + config.intervalDays);
    return next;
  }
  // cronExpression: graphile-worker handles scheduling natively;
  // set next_run_at to now for initial trigger (worker takes over after).
  if (config.cronExpression) {
    return new Date();
  }
  return null;
}

// ── Service ────────────────────────────────────────────────────────────────────

export class WorkItemRecurrenceService {
  constructor(
    private readonly em: EntityManager,
    private readonly taskService: WorkItemService,
  ) {}

  private serialize(rule: TaskRecurrenceRule): RecurrenceRuleOutput {
    return {
      id: rule.id,
      orgId: (rule.org as Org)?.id ?? (rule as any).org_id ?? "",
      sourceTaskId: rule.sourceTaskId,
      triggerType: rule.triggerType,
      cronExpression: rule.cronExpression,
      intervalDays: rule.intervalDays,
      timezone: rule.timezone,
      enabled: rule.enabled,
      occurrencesCreated: rule.occurrencesCreated,
      nextRunAt: rule.nextRunAt,
      lastRunAt: rule.lastRunAt,
      maxOccurrences: rule.maxOccurrences,
      endDate: rule.endDate,
      createdAt: rule.createdAt,
    };
  }

  async create(
    orgId: string,
    sourceTaskId: string,
    config: RecurrenceConfig,
  ): Promise<RecurrenceRuleOutput> {
    if (config.triggerType === "schedule" && !config.cronExpression && !config.intervalDays) {
      throw new AppValidationError("Schedule recurrence requires cronExpression or intervalDays");
    }

    // Snapshot the source task's fields as templateData
    const task = await this.taskService.get(orgId, sourceTaskId);
    if (!task) {
      throw new AppNotFoundError(`Task ${sourceTaskId} not found`);
    }

    const templateData = {
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      points: task.points,
    };

    const rule = this.em.create(TaskRecurrenceRule, {
      org: { id: orgId } as Org,
      sourceTaskId,
      triggerType: config.triggerType,
      cronExpression: config.cronExpression ?? null,
      intervalDays: config.intervalDays ?? null,
      timezone: config.timezone ?? "UTC",
      includeSubtasks: config.includeSubtasks ?? false,
      startDate: config.startDate ?? null,
      endDate: config.endDate ?? null,
      maxOccurrences: config.maxOccurrences ?? null,
      templateData,
      nextRunAt: calculateNextRunAt(config),
    } as never);

    await this.em.save(rule);
    return this.serialize(rule);
  }

  /** Called by graphile-worker job — processes all due recurrence rules */
  async processDue(): Promise<void> {
    const now = new Date();

    const { LessThanOrEqual } = await import("typeorm");
    const rules = await this.em.find(TaskRecurrenceRule, { where: {
      nextRunAt: LessThanOrEqual(now),
      enabled: true,
    } as never, relations: ["org"] });

    for (const rule of rules) {
      const orgId = (rule.org as Org)?.id ?? (rule as any).org_id;
      const data = (rule.templateData ?? {}) as Record<string, unknown>;

      // Clone task via WorkItemService
      await this.taskService.create(orgId, {
        title: String(data["title"] ?? "Recurring task"),
        description: typeof data["description"] === "string" ? data["description"] : null,
        status: typeof data["status"] === "string" ? data["status"] : null,
        priority: typeof data["priority"] === "number" ? data["priority"] : null,
        points: typeof data["points"] === "number" ? data["points"] : null,
      });

      rule.occurrencesCreated += 1;
      rule.lastRunAt = now;

      // Check bounds
      const hitMaxOccurrences = rule.maxOccurrences != null &&
        rule.occurrencesCreated >= rule.maxOccurrences;
      const hitEndDate = rule.endDate != null && now >= rule.endDate;

      if (hitMaxOccurrences || hitEndDate) {
        rule.enabled = false;
        rule.nextRunAt = null;
      } else if (rule.intervalDays) {
        const next = new Date(now);
        next.setDate(next.getDate() + rule.intervalDays);
        rule.nextRunAt = next;
      }

      await this.em.save(rule);
    }
  }

  /** Trigger on_complete recurrence rules when a task is completed */
  async onTaskComplete(orgId: string, taskId: string): Promise<void> {
    const rules = await this.em.find(TaskRecurrenceRule, { where: {
      sourceTaskId: taskId,
      triggerType: "on_complete",
      enabled: true,
      org: { id: orgId },
    } as never });

    const now = new Date();
    for (const rule of rules) {
      if (rule.intervalDays) {
        const next = new Date(now);
        next.setDate(next.getDate() + rule.intervalDays);
        rule.nextRunAt = next;
      } else {
        rule.nextRunAt = now;
      }
    }

    if (rules.length > 0) {
    }
  }

  async delete(orgId: string, ruleId: string): Promise<void> {
    const rule = await this.em.findOne(TaskRecurrenceRule, { where: {
      id: ruleId,
      org: { id: orgId },
    } as never });

    if (!rule) {
      throw new AppNotFoundError(`Recurrence rule ${ruleId} not found`);
    }

    await this.em.remove(rule);
  }

  async list(orgId: string, taskId: string): Promise<RecurrenceRuleOutput[]> {
    const rules = await this.em.find(TaskRecurrenceRule, { where: {
      sourceTaskId: taskId,
      org: { id: orgId },
    } as never });

    return rules.map((r) => this.serialize(r));
  }
}
