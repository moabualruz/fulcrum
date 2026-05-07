import type { EntityManager } from "@mikro-orm/postgresql";
import { z } from "zod";

import { CustomFieldDef } from "../../db/entities/tasks/CustomFieldDef.ts";

export const CustomFieldTypeSchema = z.enum([
  "text",
  "boolean",
  "select",
  "multi_select",
  "number",
  "date",
  "user",
  "url",
  "json",
]);

export const CustomFieldDefOutputSchema = z.object({
  id: z.uuid(),
  orgId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  projectId: z.uuid(),
  entityType: z.literal("task"),
  name: z.string(),
  slug: z.string(),
  type: CustomFieldTypeSchema,
  configJson: z.record(z.string(), z.unknown()),
  required: z.boolean(),
  archived: z.boolean(),
  position: z.number().int(),
});

export type CustomFieldDefOutput = z.infer<typeof CustomFieldDefOutputSchema>;

export interface CustomFieldAppContext {
  orgId: string;
  userId: string;
}

export function serializeCustomFieldDef(field: CustomFieldDef): CustomFieldDefOutput {
  return {
    id: field.id,
    orgId: field.org.id,
    projectId: field.projectId,
    entityType: "task",
    name: field.name,
    slug: field.slug,
    type: field.type,
    configJson: field.configJson,
    required: field.required,
    archived: field.archived,
    position: field.position,
  };
}

export async function listCustomFieldDefs(
  em: EntityManager,
  ctx: CustomFieldAppContext,
  input?: { entityType?: "task" },
): Promise<CustomFieldDefOutput[]> {
  if (input?.entityType && input.entityType !== "task") return [];
  const fields = await em.find(
    CustomFieldDef,
    { org: ctx.orgId, archived: false } as never,
    { orderBy: { position: "ASC", name: "ASC", id: "ASC" } },
  );
  return fields.map(serializeCustomFieldDef);
}
