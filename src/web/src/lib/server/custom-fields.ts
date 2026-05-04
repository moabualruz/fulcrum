/**
 * Custom fields — migrated from raw ProductDb to MikroORM EntityManager.
 * ARCH-01/ARCH-02: All DB access via MikroORM EM connection.
 */

import type { EntityManager } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";
import { eventDispatcher } from "../../../../product-kernel/event-dispatcher.ts";

export type FieldType = "text" | "number" | "date" | "select" | "multi_select" | "checkbox";

export const FIELD_TYPES: readonly FieldType[] = [
  "text", "number", "date", "select", "multi_select", "checkbox",
] as const;

export interface CustomFieldRow {
  id: string;
  org_id: string;
  project_id: string;
  name: string;
  field_type: FieldType;
  required: boolean;
  options: string[];
  sort_order: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateFieldInput {
  orgId: string;
  projectId: string;
  name: string;
  fieldType: FieldType;
  required?: boolean;
  options?: string[];
}

export interface UpdateFieldInput {
  id: string;
  name?: string;
  required?: boolean;
  options?: string[];
  sortOrder?: number;
}

function assertFieldType(v: unknown, label: string): asserts v is FieldType {
  if (!FIELD_TYPES.includes(v as FieldType)) throw new Error(`${label}: invalid field_type ${String(v)}`);
}

export async function createCustomField(
  em: EntityManager,
  input: CreateFieldInput,
): Promise<{ id: string }> {
  assertFieldType(input.fieldType, "createCustomField");
  const id = randomUUID();
  const conn = em.getConnection();
  const maxRows = await conn.execute<{ mx: number | null }[]>(
    `SELECT MAX(sort_order) AS mx FROM custom_fields WHERE project_id = $1`,
    [input.projectId],
  );
  const nextOrder = ((maxRows[0]?.mx as number | null) ?? -1) + 1;
  await conn.execute(
    `INSERT INTO custom_fields (id, org_id, project_id, name, field_type, required, options, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [
      id,
      input.orgId,
      input.projectId,
      input.name,
      input.fieldType,
      input.required ?? false,
      JSON.stringify(input.options ?? []),
      nextOrder,
    ],
  );
  await eventDispatcher.dispatch(em, {
    orgId: input.orgId,
    projectId: input.projectId,
    actor: "system",
    subjectKind: "custom_field",
    subjectId: id,
    verb: "created",
    payload: { name: input.name, fieldType: input.fieldType },
  });
  return { id };
}

export async function updateCustomField(
  em: EntityManager,
  input: UpdateFieldInput,
): Promise<{ ok: true }> {
  if (!input.id) throw new Error("updateCustomField: id required");
  const sets: string[] = [];
  const params: (string | number | boolean | null)[] = [];
  const changed: string[] = [];
  const push = (col: string, val: string | number | boolean | null) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
    changed.push(col);
  };
  if (input.name !== undefined) push("name", input.name);
  if (input.required !== undefined) push("required", input.required);
  if (input.options !== undefined) {
    params.push(JSON.stringify(input.options));
    sets.push(`options = $${params.length}::jsonb`);
    changed.push("options");
  }
  if (input.sortOrder !== undefined) push("sort_order", input.sortOrder);
  if (changed.length === 0) throw new Error("updateCustomField: no fields to update");
  sets.push("updated_at = now()");
  params.push(input.id);
  const conn = em.getConnection();
  const rows = await conn.execute<{ org_id: string; project_id: string }[]>(
    `UPDATE custom_fields SET ${sets.join(", ")} WHERE id = $${params.length}
       RETURNING org_id, project_id`,
    params,
  );
  if (!rows[0]) throw new Error(`updateCustomField: not found: ${input.id}`);
  await eventDispatcher.dispatch(em, {
    orgId: rows[0].org_id,
    projectId: rows[0].project_id,
    actor: "system",
    subjectKind: "custom_field",
    subjectId: input.id,
    verb: "updated",
    payload: { changed },
  });
  return { ok: true };
}

export async function archiveCustomField(
  em: EntityManager,
  id: string,
): Promise<{ ok: true }> {
  const conn = em.getConnection();
  const rows = await conn.execute<{ org_id: string; project_id: string }[]>(
    `UPDATE custom_fields SET archived = true, updated_at = now() WHERE id = $1
       RETURNING org_id, project_id`,
    [id],
  );
  if (!rows[0]) throw new Error(`archiveCustomField: not found: ${id}`);
  await eventDispatcher.dispatch(em, {
    orgId: rows[0].org_id,
    projectId: rows[0].project_id,
    actor: "system",
    subjectKind: "custom_field",
    subjectId: id,
    verb: "archived",
  });
  return { ok: true };
}

export async function listCustomFields(
  em: EntityManager,
  projectId: string,
  includeArchived = false,
): Promise<CustomFieldRow[]> {
  const where = includeArchived
    ? `WHERE project_id = $1`
    : `WHERE project_id = $1 AND archived = false`;
  const conn = em.getConnection();
  return conn.execute<CustomFieldRow[]>(
    `SELECT * FROM custom_fields ${where} ORDER BY sort_order ASC, created_at ASC`,
    [projectId],
  );
}
