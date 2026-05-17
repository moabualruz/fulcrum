import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

import { createSavedViewApiForEvent } from "$lib/server/saved-view-api";
import { ensureProjectExists } from "$lib/server/project-api";

interface PublicSavedView {
  id: string;
  projectId?: string;
  project_id?: string;
  name: string;
  scope?: string;
  viewType?: string;
  view_type?: string;
  filters?: Record<string, unknown>;
  sortBy?: string | null;
  sort_by?: string | null;
  isDefault?: boolean;
  is_default?: boolean;
  traceId?: string;
  trace_id?: string;
}

export const load: PageServerLoad = async (event) => {
  const { params } = event;
  await ensureProjectExists(event, params.id);
  const view = await createSavedViewApiForEvent(event).savedViews.get({ id: params.viewId }) as PublicSavedView | null;
  if (!view) throw error(404, "Saved view not found");
  return { projectId: params.id, view: toViewRow(view) };
};

export const actions: Actions = {
  update: async (event) => {
    const fd = await event.request.formData();
    const name = field(fd, "name");
    if (!name) return fail(400, { error: "Name is required" });
    await createSavedViewApiForEvent(event).savedViews.update({
      id: event.params.viewId,
      name,
      scope: field(fd, "scope") || undefined,
      viewType: field(fd, "viewType") || undefined,
      sortBy: field(fd, "sortBy") || null,
      isDefault: fd.get("isDefault") === "on",
    });
    return { success: true };
  },
};

function toViewRow(view: PublicSavedView) {
  return {
    id: view.id,
    projectId: view.projectId ?? view.project_id ?? "",
    name: view.name,
    scope: view.scope ?? "project",
    viewType: view.viewType ?? view.view_type ?? "list",
    filters: view.filters ?? {},
    sortBy: view.sortBy ?? view.sort_by ?? null,
    isDefault: view.isDefault ?? view.is_default ?? false,
    traceId: view.traceId ?? view.trace_id ?? "",
  };
}

function field(fd: FormData, name: string): string {
  const value = fd.get(name);
  return typeof value === "string" ? value.trim() : "";
}
