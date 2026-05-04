import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "../../../../../lib/server/db";
import {
  createCustomField,
  updateCustomField,
  archiveCustomField,
  listCustomFields,
  FIELD_TYPES,
  type FieldType,
} from "../../../../../lib/server/custom-fields";

export const load: PageServerLoad = async ({ params }) => {
  const db = await openProductDb();
  try {
    const orgId = await getDefaultOrgId(db);
    // Verify project exists
    const projRows = await db.query<{ id: string }>(
      `SELECT id FROM projects WHERE id = $1 AND org_id = $2`,
      [params.id, orgId],
    );
    if (projRows.length === 0) throw error(404, "Project not found");
    const fields = await listCustomFields(db, params.id);
    return { fields, projectId: params.id };
  } finally {
    await db.close();
  }
};

export const actions: Actions = {
  create: async ({ params, request }) => {
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
    const db = await openProductDb();
    try {
      const orgId = await getDefaultOrgId(db);
      await createCustomField(db, {
        orgId,
        projectId: params.id!,
        name,
        fieldType: fieldType as FieldType,
        required,
        options,
      });
    } finally {
      await db.close();
    }
    return { success: true };
  },
  update: async ({ request }) => {
    const fd = await request.formData();
    const id = fd.get("id") as string | null;
    if (!id) return fail(400, { error: "id required" });
    const name = fd.get("name") as string | null;
    const sortOrderRaw = fd.get("sortOrder") as string | null;
    const db = await openProductDb();
    try {
      await updateCustomField(db, {
        id,
        ...(name ? { name: name.trim() } : {}),
        ...(sortOrderRaw != null ? { sortOrder: Number(sortOrderRaw) } : {}),
      });
    } finally {
      await db.close();
    }
    return { success: true };
  },
  archive: async ({ request }) => {
    const fd = await request.formData();
    const id = fd.get("id") as string | null;
    if (!id) return fail(400, { error: "id required" });
    const db = await openProductDb();
    try {
      await archiveCustomField(db, id);
    } finally {
      await db.close();
    }
    return { success: true };
  },
};
