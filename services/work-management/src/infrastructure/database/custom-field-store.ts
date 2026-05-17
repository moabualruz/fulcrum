import { randomUUID } from "node:crypto";

import { DataSource, IsNull } from "typeorm";

import {
  type WorkManagementCustomFieldDef,
  WorkManagementCustomFieldDefEntity,
  WorkManagementFieldDependencyRuleEntity,
} from "@work-management/infrastructure/database/work-structure.entities.ts";
import {
  type FulcrumTask,
  FulcrumProjectEntity,
  FulcrumTaskEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

type JsonRecord = Record<string, unknown>;

export type CustomFieldType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "multi_select"
  | "boolean"
  | "checkbox"
  | "user"
  | "url"
  | "json";

export interface CustomFieldPublicRow {
  id: string;
  orgId: string;
  projectId: string;
  entityType: "task";
  name: string;
  slug: string;
  type: CustomFieldType;
  configJson: JsonRecord;
  required: boolean;
  archived: boolean;
  position: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TaskCustomFieldsPublicRow {
  taskId: string;
  customFields: JsonRecord;
}

export class CustomFieldStore {
  constructor(private readonly dataSource: DataSource) {}

  async list(input: {
    orgId: string;
    projectId?: string;
    includeArchived?: boolean;
    entityType?: string;
  }): Promise<CustomFieldPublicRow[]> {
    if (input.entityType && input.entityType !== "task") return [];
    const where = {
      orgId: input.orgId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.includeArchived ? {} : { archived: false }),
    };
    const fields = await this.fieldRepository().find({
      where,
      order: { position: "ASC", name: "ASC", id: "ASC" },
    });
    return fields.map(serializeField);
  }

  async create(input: {
    orgId: string;
    projectId: string;
    name: string;
    type: CustomFieldType;
    configJson?: JsonRecord;
    required?: boolean;
  }): Promise<CustomFieldPublicRow | null> {
    if (!(await this.projectBelongsToOrg(input.projectId, input.orgId))) return null;
    const position = await this.nextPosition(input.projectId);
    const field = await this.fieldRepository().save({
      id: randomUUID(),
      orgId: input.orgId,
      projectId: input.projectId,
      entityType: "task",
      name: input.name,
      slug: await this.uniqueSlug(input.projectId, input.name),
      type: normalizeFieldType(input.type),
      configJson: objectValue(input.configJson),
      required: input.required ?? false,
      archived: false,
      position,
    });
    return serializeField(field);
  }

  async update(input: {
    orgId: string;
    id: string;
    name?: string;
    type?: CustomFieldType;
    configJson?: JsonRecord;
    required?: boolean;
    position?: number;
  }): Promise<CustomFieldPublicRow | null> {
    const field = await this.fieldRepository().findOneBy({ orgId: input.orgId, id: input.id });
    if (!field) return null;

    if (input.name !== undefined) field.name = input.name;
    if (input.type !== undefined) field.type = normalizeFieldType(input.type);
    if (input.configJson !== undefined) field.configJson = objectValue(input.configJson);
    if (input.required !== undefined) field.required = input.required;
    if (input.position !== undefined) field.position = input.position;
    return serializeField(await this.fieldRepository().save(field));
  }

  async archive(input: { orgId: string; id: string }): Promise<boolean> {
    const field = await this.fieldRepository().findOneBy({ orgId: input.orgId, id: input.id });
    if (!field) return false;
    field.archived = true;
    await this.fieldRepository().save(field);
    return true;
  }

  async reorder(input: { orgId: string; projectId: string; orderedIds: string[] }): Promise<boolean> {
    if (!(await this.projectBelongsToOrg(input.projectId, input.orgId))) return false;
    const fields = await this.fieldRepository().findBy({ orgId: input.orgId, projectId: input.projectId });
    const byId = new Map(fields.map((field) => [field.id, field]));
    input.orderedIds.forEach((id, position) => {
      const field = byId.get(id);
      if (field) field.position = position;
    });
    await this.fieldRepository().save([...byId.values()]);
    return true;
  }

  async setTaskField(input: {
    orgId: string;
    taskId: string;
    fieldDefId: string;
    value: unknown;
  }): Promise<TaskCustomFieldsPublicRow | null> {
    const [task, field] = await Promise.all([
      this.findTaskInOrg(input.orgId, input.taskId),
      this.fieldRepository().findOneBy({ orgId: input.orgId, id: input.fieldDefId, archived: false }),
    ]);
    if (!task || !field || field.projectId !== task.projectId) return null;

    const value = validateFieldValue(field, input.value);
    task.customFields = { ...objectValue(task.customFields), [field.slug]: value };
    await this.assertRequiredDependencies({
      orgId: input.orgId,
      projectId: task.projectId,
      fieldValues: task.customFields,
    });
    const updated = await this.taskRepository().save(task);
    return { taskId: updated.id, customFields: objectValue(updated.customFields) };
  }

  async clearTaskField(input: {
    orgId: string;
    taskId: string;
    fieldDefId: string;
  }): Promise<TaskCustomFieldsPublicRow | null> {
    const [task, field] = await Promise.all([
      this.findTaskInOrg(input.orgId, input.taskId),
      this.fieldRepository().findOneBy({ orgId: input.orgId, id: input.fieldDefId, archived: false }),
    ]);
    if (!task || !field || field.projectId !== task.projectId) return null;
    if (field.required) throw new Error(`Custom field ${field.slug} is required.`);

    const { [field.slug]: _removed, ...customFields } = objectValue(task.customFields);
    task.customFields = customFields;
    await this.assertRequiredDependencies({
      orgId: input.orgId,
      projectId: task.projectId,
      fieldValues: task.customFields,
    });
    const updated = await this.taskRepository().save(task);
    return { taskId: updated.id, customFields: objectValue(updated.customFields) };
  }

  private async assertRequiredDependencies(input: {
    orgId: string;
    projectId: string;
    fieldValues: JsonRecord;
  }): Promise<void> {
    const rules = await this.dataSource.getRepository(WorkManagementFieldDependencyRuleEntity).findBy({
      orgId: input.orgId,
      projectId: input.projectId,
      action: "require",
    });
    const missingFields: string[] = [];
    for (const rule of rules) {
      const sourceValue = input.fieldValues[rule.sourceFieldId];
      if (String(sourceValue ?? "") !== rule.sourceValue) continue;
      if (isEmptyValue(input.fieldValues[rule.targetFieldId])) missingFields.push(rule.targetFieldId);
    }
    if (missingFields.length > 0) {
      throw new Error(`Required fields missing due to dependency rules: ${missingFields.join(", ")}`);
    }
  }

  private async findTaskInOrg(orgId: string, taskId: string): Promise<FulcrumTask | null> {
    const task = await this.taskRepository().findOneBy({ id: taskId, deletedAt: IsNull() });
    if (!task) return null;
    if (!(await this.projectBelongsToOrg(task.projectId, orgId))) return null;
    return task;
  }

  private async projectBelongsToOrg(projectId: string, orgId: string): Promise<boolean> {
    const project = await this.dataSource.getRepository(FulcrumProjectEntity).findOneBy({
      id: projectId,
      workspaceId: orgId,
    });
    return Boolean(project);
  }

  private async nextPosition(projectId: string): Promise<number> {
    const row = await this.fieldRepository()
      .createQueryBuilder("field")
      .select("MAX(field.position)", "max")
      .where("field.project_id = :projectId", { projectId })
      .getRawOne<{ max: number | string | null }>();
    return Number(row?.max ?? -1) + 1;
  }

  private async uniqueSlug(projectId: string, name: string): Promise<string> {
    const base = slugify(name);
    let candidate = base;
    let suffix = 2;
    while (await this.fieldRepository().findOneBy({ projectId, slug: candidate })) {
      candidate = `${base}_${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  private fieldRepository() {
    return this.dataSource.getRepository(WorkManagementCustomFieldDefEntity);
  }

  private taskRepository() {
    return this.dataSource.getRepository(FulcrumTaskEntity);
  }
}

function serializeField(field: WorkManagementCustomFieldDef): CustomFieldPublicRow {
  return {
    id: field.id,
    orgId: field.orgId,
    projectId: field.projectId,
    entityType: "task",
    name: field.name,
    slug: field.slug,
    type: field.type as CustomFieldType,
    configJson: objectValue(field.configJson),
    required: field.required,
    archived: field.archived,
    position: field.position,
    createdAt: dateString(field.createdAt),
    updatedAt: dateString(field.updatedAt),
  };
}

function validateFieldValue(field: WorkManagementCustomFieldDef, value: unknown): unknown {
  if (field.required && isEmptyValue(value)) throw new Error(`Custom field ${field.slug} is required.`);
  if (isEmptyValue(value)) return value;

  switch (normalizeFieldType(field.type as CustomFieldType)) {
    case "text":
    case "url":
    case "user":
      if (typeof value !== "string") throw new Error(`Invalid value for custom field ${field.slug}: expected string.`);
      return value;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`Invalid value for custom field ${field.slug}: expected number.`);
      }
      return value;
    case "date":
      if (typeof value !== "string" || (!/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isNaN(Date.parse(value)))) {
        throw new Error(`Invalid value for custom field ${field.slug}: expected date string.`);
      }
      return value;
    case "select":
      if (typeof value !== "string") throw new Error(`Invalid value for custom field ${field.slug}: expected option value.`);
      if (optionSet(field).size > 0 && !optionSet(field).has(value)) {
        throw new Error(`Invalid value for custom field ${field.slug}: unknown option.`);
      }
      return value;
    case "multi_select":
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        throw new Error(`Invalid value for custom field ${field.slug}: expected option value array.`);
      }
      if (optionSet(field).size > 0 && value.some((item) => !optionSet(field).has(item))) {
        throw new Error(`Invalid value for custom field ${field.slug}: unknown option.`);
      }
      return value;
    case "boolean":
    case "checkbox":
      if (typeof value !== "boolean") throw new Error(`Invalid value for custom field ${field.slug}: expected boolean.`);
      return value;
    case "json":
      return value;
  }
}

function optionSet(field: WorkManagementCustomFieldDef): Set<string> {
  const options = objectValue(field.configJson)["options"];
  if (!Array.isArray(options)) return new Set();
  return new Set(options.flatMap((option) => {
    if (typeof option === "string") return [option];
    const value = objectValue(option)["value"];
    return typeof value === "string" ? [value] : [];
  }));
}

function normalizeFieldType(type: CustomFieldType | string): CustomFieldType {
  return type === "checkbox" ? "boolean" : type as CustomFieldType;
}

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function objectValue(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "field";
}

function dateString(value: Date | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}
