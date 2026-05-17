import { randomUUID } from "node:crypto";

import { DataSource, IsNull } from "typeorm";

import {
  type WorkManagementTaskTemplate,
  WorkManagementTaskTemplateEntity,
} from "@work-management/infrastructure/database/work-structure.entities.ts";
import { FulcrumProjectEntity } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

type JsonRecord = Record<string, unknown>;

export interface TaskTemplatePublicRow {
  id: string;
  orgId: string;
  projectId: string | null;
  name: string;
  description: string | null;
  templateData: JsonRecord;
  isDefault: boolean;
  createdBy: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export class TaskTemplateStore {
  constructor(private readonly dataSource: DataSource) {}

  async list(input: { orgId: string; projectId?: string | null }): Promise<TaskTemplatePublicRow[]> {
    const where = input.projectId
      ? [
        { orgId: input.orgId, projectId: IsNull() },
        { orgId: input.orgId, projectId: input.projectId },
      ]
      : { orgId: input.orgId };
    const rows = await this.templateRepository().find({ where, order: { createdAt: "ASC", id: "ASC" } });
    return rows
      .sort((left, right) => templateScopeRank(left) - templateScopeRank(right))
      .map(serializeTemplate);
  }

  async create(input: {
    orgId: string;
    userId: string;
    projectId?: string | null;
    name: string;
    description?: string | null;
    templateData: JsonRecord;
  }): Promise<TaskTemplatePublicRow | null> {
    if (input.projectId && !(await this.projectBelongsToOrg(input.projectId, input.orgId))) return null;
    const template = await this.templateRepository().save({
      id: randomUUID(),
      orgId: input.orgId,
      projectId: input.projectId ?? null,
      name: input.name,
      description: input.description ?? null,
      templateData: objectValue(input.templateData),
      isDefault: false,
      createdBy: input.userId,
    });
    return serializeTemplate(template);
  }

  async apply(input: {
    orgId: string;
    templateId: string;
    overrides?: JsonRecord;
  }): Promise<JsonRecord | null> {
    const template = await this.templateRepository().findOneBy({ orgId: input.orgId, id: input.templateId });
    if (!template) return null;
    return {
      ...objectValue(template.templateData),
      ...objectValue(input.overrides),
    };
  }

  async setDefault(input: {
    orgId: string;
    projectId: string;
    templateId: string;
  }): Promise<boolean> {
    if (!(await this.projectBelongsToOrg(input.projectId, input.orgId))) return false;
    const template = await this.templateRepository().findOneBy({ orgId: input.orgId, id: input.templateId });
    if (!template) return false;

    const existing = await this.templateRepository().find({
      where: { orgId: input.orgId, projectId: input.projectId, isDefault: true },
    });
    for (const row of existing) {
      row.isDefault = false;
    }
    if (existing.length > 0) await this.templateRepository().save(existing);

    template.isDefault = true;
    await this.templateRepository().save(template);
    return true;
  }

  async delete(input: { orgId: string; templateId: string }): Promise<boolean> {
    const result = await this.templateRepository().delete({ orgId: input.orgId, id: input.templateId });
    return Number(result.affected ?? 0) > 0;
  }

  private async projectBelongsToOrg(projectId: string, orgId: string): Promise<boolean> {
    const project = await this.dataSource.getRepository(FulcrumProjectEntity).findOneBy({
      id: projectId,
      workspaceId: orgId,
    });
    return Boolean(project);
  }

  private templateRepository() {
    return this.dataSource.getRepository(WorkManagementTaskTemplateEntity);
  }
}

function serializeTemplate(template: WorkManagementTaskTemplate): TaskTemplatePublicRow {
  return {
    id: template.id,
    orgId: template.orgId,
    projectId: template.projectId,
    name: template.name,
    description: template.description,
    templateData: objectValue(template.templateData),
    isDefault: template.isDefault,
    createdBy: template.createdBy,
    createdAt: dateString(template.createdAt),
    updatedAt: dateString(template.updatedAt),
  };
}

function templateScopeRank(template: WorkManagementTaskTemplate): number {
  return template.projectId === null ? 0 : 1;
}

function objectValue(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function dateString(value: Date | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}
