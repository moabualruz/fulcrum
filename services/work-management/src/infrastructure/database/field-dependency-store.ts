import { randomUUID } from "node:crypto";

import { DataSource } from "typeorm";

import {
  type WorkManagementFieldDependencyRule,
  WorkManagementFieldDependencyRuleEntity,
} from "@work-management/infrastructure/database/work-structure.entities.ts";
import { FulcrumProjectEntity } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

export type FieldDependencyAction = "show" | "hide" | "require";

export interface FieldDependencyPublicRow {
  id: string;
  orgId: string;
  projectId: string;
  sourceFieldId: string;
  sourceValue: string;
  targetFieldId: string;
  action: FieldDependencyAction;
  createdAt: string | null;
}

export class FieldDependencyStore {
  constructor(private readonly dataSource: DataSource) {}

  async list(input: {
    orgId: string;
    projectId: string;
  }): Promise<FieldDependencyPublicRow[]> {
    const rules = await this.ruleRepository().find({
      where: { orgId: input.orgId, projectId: input.projectId },
      order: { createdAt: "ASC", id: "ASC" },
    });
    return rules.map(toPublicRow);
  }

  async create(input: {
    orgId: string;
    projectId: string;
    sourceFieldId: string;
    sourceValue: string;
    targetFieldId: string;
    action: FieldDependencyAction;
  }): Promise<FieldDependencyPublicRow | null> {
    if (!(await this.projectBelongsToOrg(input.projectId, input.orgId))) return null;
    const rule = await this.ruleRepository().save({
      id: randomUUID(),
      orgId: input.orgId,
      projectId: input.projectId,
      sourceFieldId: input.sourceFieldId.trim(),
      sourceValue: input.sourceValue,
      targetFieldId: input.targetFieldId.trim(),
      action: normalizeAction(input.action),
    });
    return toPublicRow(rule);
  }

  async delete(input: { orgId: string; id: string }): Promise<boolean> {
    const rule = await this.ruleRepository().findOneBy({ orgId: input.orgId, id: input.id });
    if (!rule) return false;
    await this.ruleRepository().remove(rule);
    return true;
  }

  async assertRequiredFields(input: {
    orgId: string;
    projectId: string;
    fieldValues: Record<string, unknown>;
  }): Promise<void> {
    const rules = await this.ruleRepository().findBy({
      orgId: input.orgId,
      projectId: input.projectId,
      action: "require",
    });

    const missingFields: string[] = [];
    for (const rule of rules) {
      const actualValue = String(input.fieldValues[rule.sourceFieldId] ?? "");
      if (actualValue !== rule.sourceValue) continue;
      if (isEmptyValue(input.fieldValues[rule.targetFieldId])) missingFields.push(rule.targetFieldId);
    }

    if (missingFields.length > 0) {
      throw new Error(`Required fields missing due to dependency rules: ${missingFields.join(", ")}`);
    }
  }

  private async projectBelongsToOrg(projectId: string, orgId: string): Promise<boolean> {
    const project = await this.dataSource.getRepository(FulcrumProjectEntity).findOneBy({
      id: projectId,
      workspaceId: orgId,
    });
    return Boolean(project);
  }

  private ruleRepository() {
    return this.dataSource.getRepository(WorkManagementFieldDependencyRuleEntity);
  }
}

function toPublicRow(rule: WorkManagementFieldDependencyRule): FieldDependencyPublicRow {
  return {
    id: rule.id,
    orgId: rule.orgId,
    projectId: rule.projectId,
    sourceFieldId: rule.sourceFieldId,
    sourceValue: rule.sourceValue,
    targetFieldId: rule.targetFieldId,
    action: normalizeAction(rule.action),
    createdAt: rule.createdAt instanceof Date ? rule.createdAt.toISOString() : null,
  };
}

function normalizeAction(action: string): FieldDependencyAction {
  if (action === "show" || action === "hide" || action === "require") return action;
  return "require";
}

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}
