/**
 * WorkItemAutomationService.
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
 *   MEDIUM-01: add_comment action uses WorkItemCommentService
 */

import type { EntityManager } from "typeorm";
import { randomUUID } from "node:crypto";
import { Engine } from "json-rules-engine";

import { ProjectAutomation } from "@work-management/infrastructure/database/entities/tasks/ProjectAutomation.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import type { EventBus, SubscriptionEvent } from "@platform-core/application/subscriptions/event-bus.ts";
import { WorkItemCommentService } from "@work-management/application/work-item-comments.ts";

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

type JsonRulesCondition = {
  fact?: string;
  operator?: string;
  value?: unknown;
  all?: JsonRulesCondition[];
  any?: JsonRulesCondition[];
};

interface ProjectAutomationInheritance {
  scope?: "self" | "children" | "descendants" | "selected";
  descendantProjectIds?: string[];
  locked?: boolean;
}

interface ProjectAutomationProject {
  id: string;
  path: string;
  depth: number;
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

export class WorkItemAutomationService {
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
        `[WorkItemAutomationService] Cycle detection: halting automation chain at depth ${depth} ` +
        `for event '${event.verb}' in project '${projectId}'.`,
      );
      return;
    }

    const projectScope = await this.resolveAutomationProjectScope(orgId, projectId);
    const { In } = await import("typeorm");
    const automations = await this.em.find(ProjectAutomation, { where: {
      org: { id: orgId },
      projectId: In(projectScope.map((project) => project.id)),
      triggerType: event.verb,
      enabled: true,
    } as never });
    const projectById = new Map(projectScope.map((project) => [project.id, project]));
    const targetProject = projectById.get(projectId) ?? { id: projectId, path: "", depth: 0 };

    for (const automation of automations) {
      if (!automationAppliesToProject(automation, targetProject, projectById.get(automation.projectId))) {
        continue;
      }
      // Evaluate condition if present
      if (automation.condition && !await evaluateCondition(automation.condition as AutomationCondition | JsonRulesCondition, event.payload)) {
        continue;
      }

      // Execute the action
      await this.executeAction(automation, event, orgId, depth);
    }
  }

  private async resolveAutomationProjectScope(orgId: string, projectId: string): Promise<ProjectAutomationProject[]> {
    try {
      const rows = await this.em.query(`WITH RECURSIVE ancestors AS (
           SELECT id, parent_id, COALESCE(path, id::text) AS path, COALESCE(depth, 0) AS depth
             FROM projects
            WHERE org_id = ? AND id = ?
           UNION ALL
           SELECT p.id, p.parent_id, COALESCE(p.path, p.id::text) AS path, COALESCE(p.depth, 0) AS depth
             FROM projects p
             JOIN ancestors a ON p.id = a.parent_id
            WHERE p.org_id = ?
         )
         SELECT id, path, depth FROM ancestors ORDER BY depth ASC, path ASC`, [orgId, projectId, orgId], );
      return rows.length > 0 ? rows : [{ id: projectId, path: projectId, depth: 0 }];
    } catch {
      return [{ id: projectId, path: projectId, depth: 0 }];
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
      let executed = false;
      switch (automation.actionType) {
        case "set_status": {
          const status = config["status"] as string | undefined;
          if (status && event.taskId) {
            await this.em.query(
              `update tasks set status = ?, updated_at = now() where org_id = ? and id = ? and deleted_at is null`,
              [status, orgId, event.taskId],
            );
            executed = true;
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
              await this.em.query(
                `update tasks set assignee_id = ?, updated_at = now() where org_id = ? and id = ? and deleted_at is null`,
                [assigneeId, orgId, event.taskId],
              );
            } else {
              await this.em.query(
                `update tasks set assignee_id = null, updated_at = now() where org_id = ? and id = ? and deleted_at is null`,
                [orgId, event.taskId],
              );
            }
            executed = true;
          }
          break;
        }

        case "add_label": {
          const label = config["label"] as string | undefined;
          if (label && event.taskId) {
            await this.em.query(
              `update tasks set custom_fields = jsonb_set(coalesce(custom_fields, '{}'), '{label}', to_jsonb(?::text), true), updated_at = now() where org_id = ? and id = ? and deleted_at is null`,
              [label, orgId, event.taskId],
            );
            executed = true;
          }
          break;
        }

        case "remove_label": {
          if (event.taskId) {
            await this.em.query(
              `update tasks set custom_fields = custom_fields - 'label', updated_at = now() where org_id = ? and id = ? and deleted_at is null`,
              [orgId, event.taskId],
            );
            executed = true;
          }
          break;
        }

        case "add_comment": {
          // MEDIUM-01: Uses WorkItemCommentService.
          const body = config["body"] as Record<string, unknown> | undefined;
          const authorId = config["authorId"] as string | undefined;
          if (body && authorId && event.taskId) {
            const commentService = new WorkItemCommentService(this.em);
            await commentService.createComment(orgId, event.taskId, authorId, body);
            executed = true;
          }
          break;
        }

        case "subscribe_watcher": {
          const userId = config["userId"] as string | undefined;
          if (userId && event.taskId) {
            const commentService = new WorkItemCommentService(this.em);
            await commentService.subscribe(orgId, event.taskId, userId, "automation");
            executed = true;
          }
          break;
        }

        case "move_to_sprint": {
          const sprintId = config["sprintId"] as string | null | undefined;
          if (event.taskId) {
            if (sprintId) {
              await this.em.query(
                `update tasks set sprint_id = ?, updated_at = now() where org_id = ? and id = ? and deleted_at is null`,
                [sprintId, orgId, event.taskId],
              );
            } else {
              await this.em.query(
                `update tasks set sprint_id = null, updated_at = now() where org_id = ? and id = ? and deleted_at is null`,
                [orgId, event.taskId],
              );
            }
            executed = true;
          }
          break;
        }

        default:
          console.warn(`[WorkItemAutomationService] Unknown action type: '${automation.actionType}'`);
          return; // Don't increment executionCount for unknown actions
      }

      if (executed) {
        await this.recordExecutionAudit(automation, event, orgId, config);
      }

      // Increment execution count
      automation.executionCount = (automation.executionCount ?? 0) + 1;
      automation.updatedAt = new Date();
      await this.em.save(automation);
    } catch (err) {
      console.error(`[WorkItemAutomationService] Action '${automation.actionType}' failed for automation '${automation.id}':`, err);
    }
  }

  private async recordExecutionAudit(
    automation: ProjectAutomation,
    event: AutomationEvent,
    orgId: string,
    actionConfig: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.em.query(
        `insert into audit_events (id, org_id, project_id, actor_id, action, subject_kind, subject_id, payload, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?::jsonb, now())`,
        [
          randomUUID(),
          orgId,
          event.projectId,
          `automation:${automation.id}`,
          "automation.executed",
          "task",
          event.taskId,
          JSON.stringify({
            automationId: automation.id,
            triggerType: automation.triggerType,
            actionType: automation.actionType,
            actionConfig,
            eventVerb: event.verb,
          }),
        ],
      );
    } catch (err) {
      console.warn(`[WorkItemAutomationService] Audit write failed for automation '${automation.id}':`, err);
    }
  }

  // ── EventBus integration (D-90) ────────────────────────────────

  setupAutomationListener(eventBus: EventBus): void {
    for (const topic of TASK_EVENT_TOPICS) {
      eventBus.subscribe<AutomationEvent>(topic, (subscriptionEvent: SubscriptionEvent<AutomationEvent>) => {
        const payload = subscriptionEvent.payload;
        if (!payload.orgId || !payload.projectId) return;
        this.evaluate(payload, payload.orgId, payload.projectId).catch((err) => {
          console.error(`[WorkItemAutomationService] evaluate failed for topic '${topic}':`, err);
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
    const automations = await this.em.find(ProjectAutomation, { where: {
      org: { id: orgId },
      projectId,
    } as never, order: { createdAt: "ASC" } });
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
      org: { id: orgId } as Org,
      projectId: input.projectId,
      name: input.name,
      triggerType: input.triggerType,
      triggerConfig: input.triggerConfig ?? {},
      condition: input.condition ?? null,
      actionType: input.actionType,
      actionConfig: input.actionConfig ?? {},
      enabled: true,
      executionCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await this.em.save(automation);
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
    const automation = await this.em.findOne(ProjectAutomation, { where: {
      id: input.id,
      org: { id: orgId },
    } as never });
    if (!automation) return null;

    if (input.name !== undefined) automation.name = input.name;
    if (input.triggerType !== undefined) automation.triggerType = input.triggerType;
    if (input.triggerConfig !== undefined) automation.triggerConfig = input.triggerConfig ?? {};
    if (input.condition !== undefined) automation.condition = input.condition;
    if (input.actionType !== undefined) automation.actionType = input.actionType;
    if (input.actionConfig !== undefined) automation.actionConfig = input.actionConfig ?? {};
    if (input.enabled !== undefined) automation.enabled = input.enabled;
    automation.updatedAt = new Date();

    await this.em.save(automation);
    return serializeAutomation(automation);
  }

  async delete(orgId: string, id: string): Promise<{ deleted: true } | null> {
    const automation = await this.em.findOne(ProjectAutomation, { where: {
      id,
      org: { id: orgId },
    } as never });
    if (!automation) return null;
    await this.em.remove(automation);
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
async function evaluateCondition(condition: AutomationCondition | JsonRulesCondition, payload: Record<string, unknown>): Promise<boolean> {
  if (isJsonRulesCondition(condition)) {
    const conditions = "fact" in condition ? { all: [condition] } : condition;
    const engine = new Engine([{ conditions: conditions as never, event: { type: "automation.condition.matched" } }]);
    const result = await engine.run(payload);
    return result.events.length > 0;
  }
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

function isJsonRulesCondition(condition: AutomationCondition | JsonRulesCondition): condition is JsonRulesCondition {
  return "all" in condition || "any" in condition || "fact" in condition;
}

function automationAppliesToProject(
  automation: ProjectAutomation,
  targetProject: ProjectAutomationProject,
  automationProject: ProjectAutomationProject | undefined,
): boolean {
  if (automation.projectId === targetProject.id) return true;
  if (!automationProject) return false;
  const inheritance = automationInheritance(automation);
  if (inheritance.scope === "descendants") {
    return targetProject.path.startsWith(`${automationProject.path}/`);
  }
  if (inheritance.scope === "children") {
    return targetProject.path.startsWith(`${automationProject.path}/`) && targetProject.depth === automationProject.depth + 1;
  }
  if (inheritance.scope === "selected") {
    return Boolean(inheritance.descendantProjectIds?.includes(targetProject.id));
  }
  return false;
}

function automationInheritance(automation: ProjectAutomation): ProjectAutomationInheritance {
  const raw = automation.triggerConfig;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { scope: "self" };
  const inheritance = (raw as Record<string, unknown>)["inheritance"];
  if (!inheritance || typeof inheritance !== "object" || Array.isArray(inheritance)) return { scope: "self" };
  return inheritance as ProjectAutomationInheritance;
}
