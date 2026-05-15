import type { EntityManager } from "typeorm";
import { z } from "zod";

import type {
  CreateFieldInput,
  CustomFieldRow,
  FieldType,
  TaskCustomFieldsOutput,
  UpdateFieldInput,
} from "@work-management/application/custom-fields/commands.ts";
import type { CustomFieldAppContext } from "@work-management/application/custom-fields/queries.ts";

export type {
  CreateFieldInput,
  CustomFieldRow,
  FieldType,
  TaskCustomFieldsOutput,
  UpdateFieldInput,
};

export const FIELD_TYPES: readonly FieldType[] = [
  "text",
  "number",
  "date",
  "select",
  "multi_select",
  "checkbox",
  "user",
  "url",
  "json",
] as const;

export const TaskCustomFieldsOutputSchema = z.object({
  taskId: z.uuid(),
  customFields: z.record(z.string(), z.unknown()),
});

export async function createCustomField(em: EntityManager, input: CreateFieldInput): Promise<{ id: string }> {
  const service = await import("@work-management/application/custom-fields/commands.ts");
  return service.createCustomField(em, input);
}

export async function updateCustomField(em: EntityManager, input: UpdateFieldInput): Promise<{ ok: true }> {
  const service = await import("@work-management/application/custom-fields/commands.ts");
  return service.updateCustomField(em, input);
}

export async function archiveCustomField(em: EntityManager, id: string): Promise<{ ok: true }> {
  const service = await import("@work-management/application/custom-fields/commands.ts");
  return service.archiveCustomField(em, id);
}

export async function listCustomFields(
  em: EntityManager,
  projectId: string,
  includeArchived = false,
): Promise<CustomFieldRow[]> {
  const service = await import("@work-management/application/custom-fields/commands.ts");
  return service.listCustomFields(em, projectId, includeArchived);
}

export async function setTaskCustomField(
  em: EntityManager,
  ctx: CustomFieldAppContext,
  input: { taskId: string; fieldDefId: string; value: unknown },
): Promise<TaskCustomFieldsOutput | null> {
  const service = await import("@work-management/application/custom-fields/commands.ts");
  return service.setTaskCustomField(em, ctx, input);
}

export async function clearTaskCustomField(
  em: EntityManager,
  ctx: CustomFieldAppContext,
  input: { taskId: string; fieldDefId: string },
): Promise<TaskCustomFieldsOutput | null> {
  const service = await import("@work-management/application/custom-fields/commands.ts");
  return service.clearTaskCustomField(em, ctx, input);
}
