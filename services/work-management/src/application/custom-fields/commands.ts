import type { EntityManager } from "typeorm";
import { z } from "zod";

import { CustomFieldConfigSchema, CustomFieldDef } from "@work-management/infrastructure/database/entities/tasks/CustomFieldDef.ts";
import { Task } from "@work-management/infrastructure/database/entities/tasks/Task.ts";
import { AppValidationError } from "@platform-core/domain/errors.ts";
import type { CustomFieldAppContext } from "@work-management/application/custom-fields/queries.ts";

export * from "@work-management/application/custom-fields/project-settings.ts";

export const TaskCustomFieldsOutputSchema = z.object({
  taskId: z.uuid(),
  customFields: z.record(z.string(), z.unknown()),
});

export type TaskCustomFieldsOutput = z.infer<typeof TaskCustomFieldsOutputSchema>;

async function findFieldDef(em: EntityManager, orgId: string, id: string): Promise<CustomFieldDef | null> {
  return em.findOne(CustomFieldDef, { where: { id, org: orgId, archived: false } as never });
}

async function findTask(em: EntityManager, orgId: string, id: string): Promise<Task | null> {
  return em.findOne(Task, { where: { id, org: orgId, deletedAt: null } as never });
}

function failValidation(field: CustomFieldDef, reason: string): never {
  throw new AppValidationError(`Invalid value for custom field ${field.slug}: ${reason}.`);
}

function assertRequiredValue(field: CustomFieldDef, value: unknown): void {
  if (!field.required) return;
  if (value === null || value === undefined) failValidation(field, "required value missing");
  if (typeof value === "string" && value.trim() === "") failValidation(field, "required value missing");
  if (Array.isArray(value) && value.length === 0) failValidation(field, "required value missing");
}

function selectOptions(field: CustomFieldDef): Set<string> {
  const parsed = CustomFieldConfigSchema.safeParse({
    type: field.type,
    ...field.configJson,
  });
  if (!parsed.success || !("options" in parsed.data)) return new Set();
  return new Set(parsed.data.options.map((option) => option.value));
}

function validateValue(field: CustomFieldDef, value: unknown): unknown {
  assertRequiredValue(field, value);
  if (value === null || value === undefined || value === "") return value;

  switch (field.type as CustomFieldDef["type"] | "boolean") {
    case "text":
    case "url":
    case "user":
      if (typeof value !== "string") failValidation(field, "expected string");
      return value;
    case "boolean":
      if (typeof value !== "boolean") failValidation(field, "expected boolean");
      return value;
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) failValidation(field, "expected number");
      const config = CustomFieldConfigSchema.parse({ type: "number", ...field.configJson });
      if ("min" in config && config.min !== undefined && value < config.min) failValidation(field, `must be at least ${config.min}`);
      if ("max" in config && config.max !== undefined && value > config.max) failValidation(field, `must be at most ${config.max}`);
      return value;
    }
    case "date":
      if (typeof value !== "string" || (!/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isNaN(Date.parse(value)))) {
        failValidation(field, "expected date string");
      }
      return value;
    case "select": {
      if (typeof value !== "string") failValidation(field, "expected option value");
      if (!selectOptions(field).has(value)) failValidation(field, "unknown option");
      return value;
    }
    case "multi_select": {
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        failValidation(field, "expected option value array");
      }
      const options = selectOptions(field);
      for (const item of value) {
        if (!options.has(item)) failValidation(field, "unknown option");
      }
      return value;
    }
    case "json":
      return value;
  }
}

export async function setTaskCustomField(
  em: EntityManager,
  ctx: CustomFieldAppContext,
  input: { taskId: string; fieldDefId: string; value: unknown },
): Promise<TaskCustomFieldsOutput | null> {
  const [task, field] = await Promise.all([
    findTask(em, ctx.orgId, input.taskId),
    findFieldDef(em, ctx.orgId, input.fieldDefId),
  ]);
  if (!task || !field) return null;

  const value = validateValue(field, input.value);
  task.customFields = { ...task.customFields, [field.slug]: value };
  task.updatedAt = new Date();
  await em.save(task);
  return { taskId: task.id, customFields: task.customFields };
}

export async function clearTaskCustomField(
  em: EntityManager,
  ctx: CustomFieldAppContext,
  input: { taskId: string; fieldDefId: string },
): Promise<TaskCustomFieldsOutput | null> {
  const [task, field] = await Promise.all([
    findTask(em, ctx.orgId, input.taskId),
    findFieldDef(em, ctx.orgId, input.fieldDefId),
  ]);
  if (!task || !field) return null;

  if (field.required) throw new AppValidationError(`Custom field ${field.slug} is required.`);

  const { [field.slug]: _removed, ...customFields } = task.customFields;
  task.customFields = customFields;
  task.updatedAt = new Date();
  await em.save(task);
  return { taskId: task.id, customFields: task.customFields };
}
