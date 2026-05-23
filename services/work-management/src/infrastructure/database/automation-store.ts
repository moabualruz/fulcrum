import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";

import {
  WorkAutomationEntity,
  type WorkAutomation,
} from "@work-management/infrastructure/database/automation.entities.ts";
import { FulcrumProjectEntity } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

export type AutomationConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "is_empty"
  | "is_not_empty";

export interface AutomationCondition {
  field: string;
  operator: AutomationConditionOperator;
  value?: unknown;
}

export interface AutomationTemplate {
  name: string;
  description: string;
  triggerType: string;
  triggerConfig: Record<string, unknown> | null;
  condition: Record<string, unknown> | null;
  actionType: string;
  actionConfig: Record<string, unknown>;
}

export interface AutomationPublicRow {
  id: string;
  orgId: string;
  projectId: string;
  name: string;
  triggerType: string;
  triggerConfig: Record<string, unknown> | null;
  condition: Record<string, unknown> | null;
  actionType: string;
  actionConfig: Record<string, unknown> | null;
  enabled: boolean;
  executionCount: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export class AutomationStore {
  constructor(private readonly dataSource: DataSource) {}

  async list(input: { orgId: string; projectId: string }): Promise<AutomationPublicRow[]> {
    const projectId = await this.resolveProjectId(input.projectId, input.orgId);
    if (!projectId) return [];
    const rows = await this.repository().find({
      where: { orgId: input.orgId, projectId },
      order: { createdAt: "ASC", id: "ASC" },
    });
    return rows.map(toPublicRow);
  }

  async create(input: {
    orgId: string;
    projectId: string;
    name: string;
    triggerType: string;
    triggerConfig?: Record<string, unknown> | null;
    condition?: AutomationCondition | Record<string, unknown> | null;
    actionType: string;
    actionConfig?: Record<string, unknown> | null;
  }): Promise<AutomationPublicRow> {
    const projectId = (await this.resolveProjectId(input.projectId, input.orgId)) ?? input.projectId;
    const row = await this.repository().save(this.repository().create({
      id: randomUUID(),
      orgId: input.orgId,
      projectId,
      name: input.name,
      triggerType: input.triggerType,
      triggerConfig: input.triggerConfig ?? {},
      condition: toJsonRecord(input.condition ?? null),
      actionType: input.actionType,
      actionConfig: input.actionConfig ?? {},
      enabled: true,
      executionCount: 0,
    }));
    return toPublicRow(row);
  }

  async update(input: {
    orgId: string;
    id: string;
    name?: string;
    triggerType?: string;
    triggerConfig?: Record<string, unknown> | null;
    condition?: AutomationCondition | Record<string, unknown> | null;
    actionType?: string;
    actionConfig?: Record<string, unknown> | null;
    enabled?: boolean;
  }): Promise<AutomationPublicRow | null> {
    const row = await this.repository().findOneBy({ orgId: input.orgId, id: input.id });
    if (!row) return null;
    if (input.name !== undefined) row.name = input.name;
    if (input.triggerType !== undefined) row.triggerType = input.triggerType;
    if (input.triggerConfig !== undefined) row.triggerConfig = input.triggerConfig;
    if (input.condition !== undefined) row.condition = toJsonRecord(input.condition);
    if (input.actionType !== undefined) row.actionType = input.actionType;
    if (input.actionConfig !== undefined) row.actionConfig = input.actionConfig;
    if (input.enabled !== undefined) row.enabled = input.enabled;
    await this.repository().save(row);
    return toPublicRow(row);
  }

  async delete(input: { orgId: string; id: string }): Promise<boolean> {
    const result = await this.repository().delete({ orgId: input.orgId, id: input.id });
    return Boolean(result.affected && result.affected > 0);
  }

  templates(): AutomationTemplate[] {
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
        description: "Subscribe the assignee as a watcher when status changes to in_progress",
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

  private repository() {
    return this.dataSource.getRepository(WorkAutomationEntity);
  }

  /** Resolve a slug-or-UUID project identifier to the canonical UUID. */
  private async resolveProjectId(projectId: string, orgId: string): Promise<string | null> {
    const repo = this.dataSource.getRepository(FulcrumProjectEntity);
    const byId = await repo.findOneBy({ id: projectId, workspaceId: orgId });
    if (byId) return byId.id;
    const bySlug = await repo.findOneBy({ slug: projectId, workspaceId: orgId });
    return bySlug?.id ?? null;
  }
}

function toJsonRecord(value: AutomationCondition | Record<string, unknown> | null): Record<string, unknown> | null {
  return value === null ? null : value as Record<string, unknown>;
}

function toPublicRow(row: WorkAutomation): AutomationPublicRow {
  return {
    id: row.id,
    orgId: row.orgId,
    projectId: row.projectId,
    name: row.name,
    triggerType: row.triggerType,
    triggerConfig: row.triggerConfig,
    condition: row.condition,
    actionType: row.actionType,
    actionConfig: row.actionConfig,
    enabled: row.enabled,
    executionCount: row.executionCount,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  };
}
