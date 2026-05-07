import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
  createCustomField,
  updateCustomField,
  archiveCustomField,
  listCustomFields,
  FIELD_TYPES,
  type FieldType,
} from "@/application/custom-fields/commands.ts";
import { getProjectOrNull } from "@/application/projects/queries.ts";
import { requestAppScope } from "$lib/server/application-scope";

export const load: PageServerLoad = async ({ params, locals }) => {
  const { em, ctx } = await requestAppScope(locals, params.id);
  const project = await getProjectOrNull(em, ctx, params.id);
  if (!project) throw error(404, "Project not found");
  const fields = await listCustomFields(em, params.id);
  return { fields, projectId: params.id };
};

export const actions: Actions = {
  create: async ({ params, request, locals }) => {
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
    const { em, ctx } = await requestAppScope(locals, params.id);
    await createCustomField(em, {
        orgId: ctx.orgId,
        projectId: params.id!,
        name,
        fieldType: fieldType as FieldType,
        required,
        options,
      });
    return { success: true };
  },
  update: async ({ request, locals }) => {
    const fd = await request.formData();
    const id = fd.get("id") as string | null;
    if (!id) return fail(400, { error: "id required" });
    const name = fd.get("name") as string | null;
    const sortOrderRaw = fd.get("sortOrder") as string | null;
    const { em } = await requestAppScope(locals);
    await updateCustomField(em, {
        id,
        ...(name ? { name: name.trim() } : {}),
        ...(sortOrderRaw != null ? { sortOrder: Number(sortOrderRaw) } : {}),
      });
    return { success: true };
  },
  archive: async ({ request, locals }) => {
    const fd = await request.formData();
    const id = fd.get("id") as string | null;
    if (!id) return fail(400, { error: "id required" });
    const { em } = await requestAppScope(locals);
    await archiveCustomField(em, id);
    return { success: true };
  },
};
