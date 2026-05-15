/**
 * Custom fields — migrated from raw LegacyDatabaseHandle to MikroORM EntityManager.
 * ARCH-01/ARCH-02: All DB access via MikroORM EM connection.
 */

import type { EntityManager } from "typeorm";
import { randomUUID } from "node:crypto";
import { appendEventOrm, ormSqlConnection } from "@platform-core/application/orm-helpers.ts";

export type FieldType = "text" | "number" | "date" | "select" | "multi_select" | "checkbox" | "user" | "url" | "json";

export const FIELD_TYPES: readonly FieldType[] = [
  "text", "number", "date", "select", "multi_select", "checkbox", "user", "url", "json",
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

function slugifyFieldName(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "field";
}

function optionsFromConfig(configJson: unknown): string[] {
  const config = configJson && typeof configJson === "object" && !Array.isArray(configJson)
    ? configJson as Record<string, unknown>
    : {};
  const options = Array.isArray(config.options) ? config.options : [];
  return options.flatMap((option) => {
    if (typeof option === "string") return [option];
    if (option && typeof option === "object" && typeof (option as Record<string, unknown>).value === "string") {
      const value = (option as { value: string }).value;
      return [value];
    }
    return [];
  });
}

export async function createCustomField(
  em: EntityManager,
  input: CreateFieldInput,
): Promise<{ id: string }> {
  assertFieldType(input.fieldType, "createCustomField");
  const id = randomUUID();
  const conn = ormSqlConnection(em);
  const maxRows = await conn.execute<{ mx: number | null }[]>(
    `SELECT MAX(position) AS mx FROM custom_field_defs WHERE project_id = $1`,
    [input.projectId],
  );
  const nextOrder = ((maxRows[0]?.mx as number | null) ?? -1) + 1;
  await conn.execute(
    `INSERT INTO custom_field_defs (id, org_id, project_id, name, slug, type, required, config_json, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
    [
      id,
      input.orgId,
      input.projectId,
      input.name,
      slugifyFieldName(input.name),
      input.fieldType,
      input.required ?? false,
      JSON.stringify({ options: input.options ?? [] }),
      nextOrder,
    ],
  );
  await appendEventOrm(em, {
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
    sets.push(`config_json = jsonb_set(coalesce(config_json, '{}'::jsonb), '{options}', $${params.length}::jsonb, true)`);
    changed.push("options");
  }
  if (input.sortOrder !== undefined) push("position", input.sortOrder);
  if (changed.length === 0) throw new Error("updateCustomField: no fields to update");
  params.push(input.id);
  const conn = ormSqlConnection(em);
  const rows = await conn.execute<{ org_id: string; project_id: string }[]>(
    `UPDATE custom_field_defs SET ${sets.join(", ")} WHERE id = $${params.length}
       RETURNING org_id, project_id`,
    params,
  );
  if (!rows[0]) throw new Error(`updateCustomField: not found: ${input.id}`);
  await appendEventOrm(em, {
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
  const conn = ormSqlConnection(em);
  const rows = await conn.execute<{ org_id: string; project_id: string }[]>(
    `UPDATE custom_field_defs SET archived = true WHERE id = $1
       RETURNING org_id, project_id`,
    [id],
  );
  if (!rows[0]) throw new Error(`archiveCustomField: not found: ${id}`);
  await appendEventOrm(em, {
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
  const conn = ormSqlConnection(em);
  const rows = await conn.execute<Array<Omit<CustomFieldRow, "field_type" | "options" | "sort_order" | "created_at" | "updated_at"> & {
    type: FieldType;
    config_json: unknown;
    position: number;
    created_at: string;
    updated_at: string;
  }>>(
    `SELECT id, org_id, project_id, name, type, required, config_json, position, archived,
            now()::text AS created_at, now()::text AS updated_at
       FROM custom_field_defs ${where} ORDER BY position ASC, id ASC`,
    [projectId],
  );
  return rows.map((row) => ({
    id: row.id,
    org_id: row.org_id,
    project_id: row.project_id,
    name: row.name,
    field_type: row.type,
    required: row.required,
    options: optionsFromConfig(row.config_json),
    sort_order: row.position,
    archived: row.archived,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}
