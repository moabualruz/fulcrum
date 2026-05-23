import { randomUUID } from "node:crypto";

import { DataSource } from "typeorm";

import {
  WorkManagementCustomFieldDefEntity,
  type WorkManagementFieldDependencyRule,
  WorkManagementFieldDependencyRuleEntity,
} from "@work-management/infrastructure/database/work-structure.entities.ts";
import { validateCustomFieldValue } from "@work-management/infrastructure/database/custom-field-store.ts";
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
    const sourceField = await this.fieldRepository().findOneBy({
      id: input.sourceFieldId.trim(),
      orgId: input.orgId,
      projectId: input.projectId,
      archived: false,
    });
    const targetField = await this.fieldRepository().findOneBy({
      id: input.targetFieldId.trim(),
      orgId: input.orgId,
      projectId: input.projectId,
      archived: false,
    });
    if (!sourceField || !targetField) return null;
    validateCustomFieldValue(sourceField, input.sourceValue);
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
    const fields = await this.fieldRepository().findBy({
      orgId: input.orgId,
      projectId: input.projectId,
      archived: false,
    });
    const fieldsById = new Map(fields.map((field) => [field.id, field]));
    for (const rule of rules) {
      const sourceField = fieldsById.get(rule.sourceFieldId);
      const targetField = fieldsById.get(rule.targetFieldId);
      if (!sourceField || !targetField) continue;
      const actualValue = String(input.fieldValues[sourceField.slug] ?? "");
      if (actualValue !== rule.sourceValue) continue;
      if (isEmptyValue(input.fieldValues[targetField.slug])) missingFields.push(targetField.slug);
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

  private fieldRepository() {
    return this.dataSource.getRepository(WorkManagementCustomFieldDefEntity);
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
