import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
  createSavedView,
  updateSavedView,
  deleteSavedView,
  listSavedViews,
  VIEW_SCOPES,
  type ViewScope,
} from "../../../../../../../application/saved-views/queries.ts";
import { getProjectOrNull } from "../../../../../../../application/projects/queries.ts";
import { requestAppScope } from "$lib/server/application-scope";

export const load: PageServerLoad = async ({ params, locals }) => {
  const { em, ctx } = await requestAppScope(locals, params.id);
  const project = await getProjectOrNull(em, ctx, params.id);
  if (!project) throw error(404, "Project not found");
  const views = await listSavedViews(em, params.id);
  return { views, projectId: params.id };
};

export const actions: Actions = {
  create: async ({ params, request, locals }) => {
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
    const { em, ctx } = await requestAppScope(locals, params.id);
    await createSavedView(em, {
        orgId: ctx.orgId,
        projectId: params.id!,
        name,
        scope: scope as ViewScope,
        filters,
        isDefault,
      });
    return { success: true };
  },
  update: async ({ request, locals }) => {
    const fd = await request.formData();
    const id = fd.get("id") as string | null;
    if (!id) return fail(400, { error: "id required" });
    const name = fd.get("name") as string | null;
    const isDefaultRaw = fd.get("isDefault");
    const { em } = await requestAppScope(locals);
    await updateSavedView(em, {
        id,
        ...(name ? { name: name.trim() } : {}),
        ...(isDefaultRaw != null ? { isDefault: isDefaultRaw === "on" } : {}),
      });
    return { success: true };
  },
  delete: async ({ request, locals }) => {
    const fd = await request.formData();
    const id = fd.get("id") as string | null;
    if (!id) return fail(400, { error: "id required" });
    const { em } = await requestAppScope(locals);
    await deleteSavedView(em, id);
    return { success: true };
  },
};
