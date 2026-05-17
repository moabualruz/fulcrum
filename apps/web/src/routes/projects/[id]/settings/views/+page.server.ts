import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { createSavedViewApiForEvent } from "$lib/server/saved-view-api";
import { ensureProjectExists } from "$lib/server/project-api";

type ViewScope = "org" | "project" | "private";

const VIEW_SCOPES: readonly ViewScope[] = ["org", "project", "private"] as const;

interface PublicSavedView {
  id: string;
  orgId?: string | null;
  org_id?: string | null;
  projectId?: string;
  project_id?: string;
  name: string;
  scope?: string;
  filters?: Record<string, unknown>;
  sortBy?: string | null;
  sort_by?: string | null;
  isDefault?: boolean;
  is_default?: boolean;
  createdAt?: string | null;
  created_at?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
}

export const load: PageServerLoad = async (event) => {
  const { params } = event;
  await ensureProjectExists(event, params.id);
  const views = (await createSavedViewApiForEvent(event).savedViews.list({ projectId: params.id }) as PublicSavedView[])
    .map((view) => toSavedViewRow(view));
  return { views, projectId: params.id };
};

export const actions: Actions = {
  create: async (event) => {
    const { params, request } = event;
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
    await createSavedViewApiForEvent(event).savedViews.create({
        projectId: params.id,
        name,
        scope: scope as ViewScope,
        filters,
        isDefault,
      });
    return { success: true };
  },
  update: async (event) => {
    const { request } = event;
    const fd = await request.formData();
    const id = fd.get("id") as string | null;
    if (!id) return fail(400, { error: "id required" });
    const name = fd.get("name") as string | null;
    const isDefaultRaw = fd.get("isDefault");
    await createSavedViewApiForEvent(event).savedViews.update({
        id,
        ...(name ? { name: name.trim() } : {}),
        ...(isDefaultRaw != null ? { isDefault: isDefaultRaw === "on" } : {}),
      });
    return { success: true };
  },
  delete: async (event) => {
    const { request } = event;
    const fd = await request.formData();
    const id = fd.get("id") as string | null;
    if (!id) return fail(400, { error: "id required" });
    await createSavedViewApiForEvent(event).savedViews.delete({ id });
    return { success: true };
  },
};

function toSavedViewRow(view: PublicSavedView) {
  return {
    id: view.id,
    org_id: view.orgId ?? view.org_id ?? "",
    project_id: view.projectId ?? view.project_id ?? "",
    name: view.name,
    scope: normalizeScope(view.scope),
    owner_id: null,
    filters: view.filters ?? {},
    sort_by: view.sortBy ?? view.sort_by ?? null,
    is_default: view.isDefault ?? view.is_default ?? false,
    created_at: view.createdAt ?? view.created_at ?? "",
    updated_at: view.updatedAt ?? view.updated_at ?? "",
  };
}

function normalizeScope(scope: string | undefined): ViewScope {
  return VIEW_SCOPES.includes(scope as ViewScope) ? scope as ViewScope : "project";
}
