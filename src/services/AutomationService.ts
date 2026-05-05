/**
 * AutomationService — Phase 05 Plan 06
 *
 * Rule-based automation engine for project automations.
 *
 * Security:
 *   T-05-13: Actions execute within same org scope; cannot cross org boundary.
 *   T-05-14: Max 5 chain depth with halt + warning log (D-91 cycle detection).
 *   T-05-15: CRUD requires permissioned caller (enforced in automations router).
 *
 * Implements:
 *   D-89: Automation CRUD (list, create, update, delete)
 *   D-90: setupAutomationListener subscribes to task.* EventBus events
 *   D-91: Cycle detection — max 5 chain depth
 *   D-92: getTemplates returns 4 predefined templates
 *   MEDIUM-01: add_comment action uses CommentService from Plan 03
 */

import type { EntityManager } from "@mikro-orm/postgresql";

import { ProjectAutomation } from "../db/entities/tasks/ProjectAutomation.ts";
import { Org } from "../db/entities/auth/Org.ts";
import type { EventBus, SubscriptionEvent } from "../subscriptions/event-bus.ts";
import { CommentService } from "./CommentService.ts";

// ── Types ──────────────────────────────────────────────────────────

export interface AutomationEvent {
  verb: string;
  taskId: string;
  orgId: string;
  projectId: string;
  payload: Record<string, unknown>;
}

export interface AutomationCondition {
  field: string;
  operator: "equals" | "not_equals" | "contains" | "is_empty" | "is_not_empty";
  value?: unknown;
}

export interface AutomationTemplate {
  name: string;
  description: string;
  triggerType: string;
  triggerConfig: object | null;
  condition: object | null;
  actionType: string;
  actionConfig: object;
}

export interface AutomationOutput {
  id: string;
  orgId: string;
  projectId: string;
  name: string;
  triggerType: string;
  triggerConfig: object | null;
  condition: object | null;
  actionType: string;
  actionConfig: object | null;
  enabled: boolean;
  executionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ── Cycle detection depth limit (D-91) ─────────────────────────────

const MAX_CHAIN_DEPTH = 5;

// ── TASK_EVENT_TOPICS subscribed for automation evaluation ─────────

const TASK_EVENT_TOPICS = [
  "task.status_changed",
  "task.created",
  "task.updated",
  "task.assigned",
  "task.label_changed",
  "task.sprint_changed",
];

// ── Service ────────────────────────────────────────────────────────

export class AutomationService {
  constructor(
    private readonly em: EntityManager,
    private readonly eventBus: EventBus,
  ) {}

  // ── Core evaluation ────────────────────────────────────────────

  /**
   * Evaluate automation rules for a given event.
   * depth parameter tracks chain depth for cycle detection (D-91).
   */
  async evaluate(
    event: AutomationEvent,
    orgId: string,
    projectId: string,
    depth = 0,
  ): Promise<void> {
    // D-91: Halt at max depth to prevent infinite automation chains
    if (depth >= MAX_CHAIN_DEPTH) {
      console.warn(
        `[AutomationService] Cycle detection: halting automation chain at depth ${depth} ` +
        `for event '${event.verb}' in project '${projectId}'.`,
      );
      return;
    }

    // Find enabled automations matching this trigger
    const automations = await this.em.find(ProjectAutomation, {
      org: { id: orgId },
      projectId,
      triggerType: event.verb,
      enabled: true,
    } as never);

    for (const automation of automations) {
      // Evaluate condition if present
      if (automation.condition && !evaluateCondition(automation.condition as AutomationCondition, event.payload)) {
        continue;
      }

      // Execute the action
      await this.executeAction(automation, event, orgId, depth);
    }
  }

  private async executeAction(
    automation: ProjectAutomation,
    event: AutomationEvent,
    orgId: string,
    depth: number,
  ): Promise<void> {
    const config = automation.actionConfig as Record<string, unknown> | null ?? {};

    try {
      switch (automation.actionType) {
        case "set_status": {
          const status = config["status"] as string | undefined;
          if (status && event.taskId) {
            await this.em.getConnection().execute(
              `update tasks set status = ?, updated_at = now() where org_id = ? and id = ? and deleted_at is null`,
              [status, orgId, event.taskId],
            );
            // Re-evaluate in case chained automations trigger (depth + 1)
            await this.evaluate(
              { ...event, verb: "task.status_changed", payload: { ...event.payload, toStatus: status } },
              orgId,
              event.projectId,
              depth + 1,
            );
          }
          break;
        }

        case "set_assignee": {
          const assigneeId = config["assigneeId"] as string | null | undefined;
          if (event.taskId) {
            if (assigneeId) {
              await this.em.getConnection().execute(
                `update tasks set assignee_id = ?, updated_at = now() where org_id = ? and id = ? and deleted_at is null`,
                [assigneeId, orgId, event.taskId],
              );
            } else {
              await this.em.getConnection().execute(
                `update tasks set assignee_id = null, updated_at = now() where org_id = ? and id = ? and deleted_at is null`,
                [orgId, event.taskId],
              );
            }
          }
          break;
        }

        case "add_label": {
          const label = config["label"] as string | undefined;
          if (label && event.taskId) {
            await this.em.getConnection().execute(
              `update tasks set custom_fields = jsonb_set(coalesce(custom_fields, '{}'), '{label}', to_jsonb(?::text), true), updated_at = now() where org_id = ? and id = ? and deleted_at is null`,
              [label, orgId, event.taskId],
            );
          }
          break;
        }

        case "remove_label": {
          if (event.taskId) {
            await this.em.getConnection().execute(
              `update tasks set custom_fields = custom_fields - 'label', updated_at = now() where org_id = ? and id = ? and deleted_at is null`,
              [orgId, event.taskId],
            );
          }
          break;
        }

        case "add_comment": {
          // MEDIUM-01: Uses CommentService from Plan 03
          const body = config["body"] as Record<string, unknown> | undefined;
          const authorId = config["authorId"] as string | undefined;
          if (body && authorId && event.taskId) {
            const commentService = new CommentService(this.em);
            await commentService.createComment(orgId, event.taskId, authorId, body);
          }
          break;
        }

        case "subscribe_watcher": {
          const userId = config["userId"] as string | undefined;
          if (userId && event.taskId) {
            const commentService = new CommentService(this.em);
            await commentService.subscribe(orgId, event.taskId, userId, "automation");
          }
          break;
        }

        case "move_to_sprint": {
          const sprintId = config["sprintId"] as string | null | undefined;
          if (event.taskId) {
            if (sprintId) {
              await this.em.getConnection().execute(
                `update tasks set sprint_id = ?, updated_at = now() where org_id = ? and id = ? and deleted_at is null`,
                [sprintId, orgId, event.taskId],
              );
            } else {
              await this.em.getConnection().execute(
                `update tasks set sprint_id = null, updated_at = now() where org_id = ? and id = ? and deleted_at is null`,
                [orgId, event.taskId],
              );
            }
          }
          break;
        }

        default:
          console.warn(`[AutomationService] Unknown action type: '${automation.actionType}'`);
          return; // Don't increment executionCount for unknown actions
      }

      // Increment execution count
      automation.executionCount = (automation.executionCount ?? 0) + 1;
      automation.updatedAt = new Date();
      this.em.persist(automation);
      await this.em.flush();
    } catch (err) {
      console.error(`[AutomationService] Action '${automation.actionType}' failed for automation '${automation.id}':`, err);
    }
  }

  // ── EventBus integration (D-90) ────────────────────────────────

  setupAutomationListener(eventBus: EventBus): void {
    for (const topic of TASK_EVENT_TOPICS) {
      eventBus.subscribe<AutomationEvent>(topic, (subscriptionEvent: SubscriptionEvent<AutomationEvent>) => {
        const payload = subscriptionEvent.payload;
        if (!payload.orgId || !payload.projectId) return;
        this.evaluate(payload, payload.orgId, payload.projectId).catch((err) => {
          console.error(`[AutomationService] evaluate failed for topic '${topic}':`, err);
        });
      });
    }
  }

  // ── Templates (D-92) ───────────────────────────────────────────

  getTemplates(): AutomationTemplate[] {
    return [
      {
        name: "Close stale tasks",
        description: "Automatically close tasks that have not been updated in 30 days",
        triggerType: "task.stale_detected",
        triggerConfig: { staleDays: 30 },
        condition: null,
        actionType: "set_status",
        actionConfig: { status: "closed" },
      },
      {
        name: "Auto-assign by label",
        description: "Assign tasks to a specific user when a label is applied",
        triggerType: "task.label_changed",
        triggerConfig: null,
        condition: { field: "label", operator: "equals", value: "needs-review" },
        actionType: "set_assignee",
        actionConfig: { assigneeId: null },
      },
      {
        name: "Notify on status change",
        description: "Subscribe the assignee as a watcher when status changes to 'in_progress'",
        triggerType: "task.status_changed",
        triggerConfig: null,
        condition: { field: "toStatus", operator: "equals", value: "in_progress" },
        actionType: "subscribe_watcher",
        actionConfig: { userId: null },
      },
      {
        name: "Sprint auto-close",
        description: "Move completed tasks to done status when sprint closes",
        triggerType: "sprint.closed",
        triggerConfig: null,
        condition: null,
        actionType: "set_status",
        actionConfig: { status: "done" },
      },
    ];
  }

  // ── CRUD ───────────────────────────────────────────────────────

  async list(orgId: string, projectId: string): Promise<AutomationOutput[]> {
    const automations = await this.em.find(ProjectAutomation, {
      org: { id: orgId },
      projectId,
    } as never, { orderBy: { createdAt: "ASC" } });
    return automations.map(serializeAutomation);
  }

  async create(orgId: string, input: {
    projectId: string;
    name: string;
    triggerType: string;
    triggerConfig?: object | null;
    condition?: object | null;
    actionType: string;
    actionConfig?: object | null;
  }): Promise<AutomationOutput> {
    const automation = this.em.create(ProjectAutomation, {
      org: this.em.getReference(Org, orgId),
      projectId: input.projectId,
      name: input.name,
      triggerType: input.triggerType,
      triggerConfig: input.triggerConfig ?? null,
      condition: input.condition ?? null,
      actionType: input.actionType,
      actionConfig: input.actionConfig ?? null,
      enabled: true,
      executionCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    this.em.persist(automation);
    await this.em.flush();
    return serializeAutomation(automation);
  }

  async update(orgId: string, input: {
    id: string;
    name?: string;
    triggerType?: string;
    triggerConfig?: object | null;
    condition?: object | null;
    actionType?: string;
    actionConfig?: object | null;
    enabled?: boolean;
  }): Promise<AutomationOutput | null> {
    const automation = await this.em.findOne(ProjectAutomation, {
      id: input.id,
      org: { id: orgId },
    } as never);
    if (!automation) return null;

    if (input.name !== undefined) automation.name = input.name;
    if (input.triggerType !== undefined) automation.triggerType = input.triggerType;
    if (input.triggerConfig !== undefined) automation.triggerConfig = input.triggerConfig;
    if (input.condition !== undefined) automation.condition = input.condition;
    if (input.actionType !== undefined) automation.actionType = input.actionType;
    if (input.actionConfig !== undefined) automation.actionConfig = input.actionConfig;
    if (input.enabled !== undefined) automation.enabled = input.enabled;
    automation.updatedAt = new Date();

    await this.em.flush();
    return serializeAutomation(automation);
  }

  async delete(orgId: string, id: string): Promise<{ deleted: true } | null> {
    const automation = await this.em.findOne(ProjectAutomation, {
      id,
      org: { id: orgId },
    } as never);
    if (!automation) return null;
    this.em.remove(automation);
    await this.em.flush();
    return { deleted: true };
  }
}

// ── Helpers ────────────────────────────────────────────────────────

function serializeAutomation(automation: ProjectAutomation): AutomationOutput {
  return {
    id: automation.id,
    orgId: automation.org.id,
    projectId: automation.projectId,
    name: automation.name,
    triggerType: automation.triggerType,
    triggerConfig: automation.triggerConfig,
    condition: automation.condition,
    actionType: automation.actionType,
    actionConfig: automation.actionConfig,
    enabled: automation.enabled,
    executionCount: automation.executionCount,
    createdAt: automation.createdAt,
    updatedAt: automation.updatedAt,
  };
}

/**
 * Evaluate an automation condition against the event payload.
 * Returns true if condition passes (action should fire).
 */
function evaluateCondition(condition: AutomationCondition, payload: Record<string, unknown>): boolean {
  const fieldValue = payload[condition.field];

  switch (condition.operator) {
    case "equals":
      return String(fieldValue) === String(condition.value);
    case "not_equals":
      return String(fieldValue) !== String(condition.value);
    case "contains":
      return typeof fieldValue === "string" && fieldValue.includes(String(condition.value));
    case "is_empty":
      return fieldValue === null || fieldValue === undefined || fieldValue === "";
    case "is_not_empty":
      return fieldValue !== null && fieldValue !== undefined && fieldValue !== "";
    default:
      return false;
  }
}
