import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { createCustomFieldApiForEvent } from "$lib/server/custom-field-api";
import { ensureProjectExists } from "$lib/server/project-api";

type FieldType = "text" | "number" | "date" | "select" | "multi_select" | "checkbox" | "user" | "url" | "json";

const FIELD_TYPES: readonly FieldType[] = [
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

interface PublicCustomField {
  id: string;
  orgId?: string;
  org_id?: string;
  projectId?: string;
  project_id?: string;
  name: string;
  type?: string;
  field_type?: string;
  configJson?: Record<string, unknown>;
  config_json?: Record<string, unknown>;
  required?: boolean;
  archived?: boolean;
  position?: number;
  sort_order?: number;
  createdAt?: string | null;
  created_at?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
}

export const load: PageServerLoad = async (event) => {
  const { params } = event;
  await ensureProjectExists(event, params.id);
  const fields = (await createCustomFieldApiForEvent(event).customFields.list({ projectId: params.id }) as PublicCustomField[])
    .map((field) => toCustomFieldRow(field));
  return { fields, projectId: params.id };
};

export const actions: Actions = {
  create: async (event) => {
    const { params, request } = event;
    const fd = await request.formData();
    const name = (fd.get("name") as string | null)?.trim();
    const fieldType = fd.get("fieldType") as string | null;
    const required = fd.get("required") === "on";
    const optionsRaw = fd.get("options") as string | null;
    if (!name) return fail(400, { error: "Name is required" });
    if (!fieldType || !FIELD_TYPES.includes(fieldType as FieldType)) {
      return fail(400, { error: "Invalid field type" });
    }
    const options = optionsRaw
      ? optionsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    await createCustomFieldApiForEvent(event).customFields.create({
        projectId: params.id,
        name,
        type: fieldType,
        required,
        configJson: options.length > 0 ? { options } : undefined,
      });
    return { success: true };
  },
  update: async (event) => {
    const { request } = event;
    const fd = await request.formData();
    const id = fd.get("id") as string | null;
    if (!id) return fail(400, { error: "id required" });
    const name = fd.get("name") as string | null;
    const sortOrderRaw = fd.get("sortOrder") as string | null;
    await createCustomFieldApiForEvent(event).customFields.update({
        id,
        ...(name ? { name: name.trim() } : {}),
        ...(sortOrderRaw != null ? { position: Number(sortOrderRaw) } : {}),
      });
    return { success: true };
  },
  archive: async (event) => {
    const { request } = event;
    const fd = await request.formData();
    const id = fd.get("id") as string | null;
    if (!id) return fail(400, { error: "id required" });
    await createCustomFieldApiForEvent(event).customFields.delete({ id });
    return { success: true };
  },
};

function toCustomFieldRow(field: PublicCustomField) {
  const config = field.configJson ?? field.config_json ?? {};
  return {
    id: field.id,
    org_id: field.orgId ?? field.org_id ?? "",
    project_id: field.projectId ?? field.project_id ?? "",
    name: field.name,
    field_type: normalizeFieldType(field.type ?? field.field_type ?? "text"),
    required: field.required ?? false,
    options: optionsFromConfig(config),
    sort_order: field.position ?? field.sort_order ?? 0,
    archived: field.archived ?? false,
    created_at: field.createdAt ?? field.created_at ?? "",
    updated_at: field.updatedAt ?? field.updated_at ?? "",
  };
}

function normalizeFieldType(type: string): FieldType {
  return type === "boolean" ? "checkbox" : type as FieldType;
}

function optionsFromConfig(config: Record<string, unknown>): string[] {
  const options = Array.isArray(config.options) ? config.options : [];
  return options.flatMap((option) => {
    if (typeof option === "string") return [option];
    if (option && typeof option === "object") {
      const value = (option as Record<string, unknown>).value;
      if (typeof value === "string") return [value];
    }
    return [];
  });
}
