import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "@fulcrum/lib/server/db";
import {
  createSavedView,
  updateSavedView,
  deleteSavedView,
  listSavedViews,
  VIEW_SCOPES,
  type ViewScope,
} from "@fulcrum/lib/server/saved-views";

export const load: PageServerLoad = async ({ params }) => {
  const db = await openProductDb();
  try {
    const orgId = await getDefaultOrgId(db);
    const projRows = await db.query<{ id: string }>(
      `SELECT id FROM projects WHERE id = $1 AND org_id = $2`,
      [params.id, orgId],
    );
    if (projRows.length === 0) throw error(404, "Project not found");
    const views = await listSavedViews(db, params.id);
    return { views, projectId: params.id };
  } finally {
    await db.close();
  }
};

export const actions: Actions = {
  create: async ({ params, request }) => {
    const fd = await request.formData();
    const name = (fd.get("name") as string | null)?.trim();
    const scope = (fd.get("scope") as string | null) || "project";
    const filtersRaw = fd.get("filters") as string | null;
    const isDefault = fd.get("isDefault") === "on";
    if (!name) return fail(400, { error: "Name is required" });
    if (!VIEW_SCOPES.includes(scope as ViewScope)) {
      return fail(400, { error: "Invalid scope" });
    }
    let filters: Record<string, unknown> = {};
    if (filtersRaw) {
      try {
        filters = JSON.parse(filtersRaw);
      } catch {
        return fail(400, { error: "Invalid filters JSON" });
      }
    }
    const db = await openProductDb();
    try {
      const orgId = await getDefaultOrgId(db);
      await createSavedView(db, {
        orgId,
        projectId: params.id!,
        name,
        scope: scope as ViewScope,
        filters,
        isDefault,
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
    const isDefaultRaw = fd.get("isDefault");
    const db = await openProductDb();
    try {
      await updateSavedView(db, {
        id,
        ...(name ? { name: name.trim() } : {}),
        ...(isDefaultRaw != null ? { isDefault: isDefaultRaw === "on" } : {}),
      });
    } finally {
      await db.close();
    }
    return { success: true };
  },
  delete: async ({ request }) => {
    const fd = await request.formData();
    const id = fd.get("id") as string | null;
    if (!id) return fail(400, { error: "id required" });
    const db = await openProductDb();
    try {
      await deleteSavedView(db, id);
    } finally {
      await db.close();
    }
    return { success: true };
  },
};
