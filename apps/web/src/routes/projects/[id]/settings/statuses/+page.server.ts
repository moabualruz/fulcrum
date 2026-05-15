import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { ensureProjectExists } from "$lib/server/project-api";
import {
  createProjectStatus,
  updateProjectStatus,
  deleteProjectStatus,
  listProjectStatuses,
} from "$lib/server/project-statuses";

export const load: PageServerLoad = async (event) => {
  const { params, locals } = event;
  await ensureProjectExists(event, params.id);
  const { em } = await requestScopedApp(locals, params.id);
  const statuses = await listProjectStatuses(em, params.id);
  return { statuses, projectId: params.id };
};

export const actions: Actions = {
  create: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const name = (fd.get("name") as string | null)?.trim();
    const color = (fd.get("color") as string | null)?.trim() || "#6b7280";
    const isFinal = fd.get("isFinal") === "on";
    if (!name) return fail(400, { error: "Name is required" });
    const { em, ctx } = await requestScopedApp(locals, params.id);
    await createProjectStatus(em, {
      orgId: ctx.orgId,
      projectId: params.id!,
      name,
      color,
      isFinal,
    });
    return { success: true };
  },
  update: async ({ request, locals }) => {
    const fd = await request.formData();
    const id = fd.get("id") as string | null;
    if (!id) return fail(400, { error: "id required" });
    const name = fd.get("name") as string | null;
    const color = fd.get("color") as string | null;
    const isFinalRaw = fd.get("isFinal");
    const sortOrderRaw = fd.get("sortOrder") as string | null;
    const { em } = await requestScopedApp(locals);
    await updateProjectStatus(em, {
      id,
      ...(name ? { name: name.trim() } : {}),
      ...(color ? { color: color.trim() } : {}),
      ...(isFinalRaw != null ? { isFinal: isFinalRaw === "on" } : {}),
      ...(sortOrderRaw != null ? { sortOrder: Number(sortOrderRaw) } : {}),
    });
    return { success: true };
  },
  delete: async ({ request, locals }) => {
    const fd = await request.formData();
    const id = fd.get("id") as string | null;
    if (!id) return fail(400, { error: "id required" });
    const { em } = await requestScopedApp(locals);
    await deleteProjectStatus(em, id);
    return { success: true };
  },
};

async function requestScopedApp(locals: App.Locals, projectId?: string) {
  const { requestServiceScope } = await import("$lib/server/request-service-scope");
  return requestServiceScope(locals, projectId);
}
