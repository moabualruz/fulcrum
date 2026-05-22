import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { ensureProjectExists } from "$lib/server/project-api";
import { createProjectStatusApiForEvent } from "$lib/server/project-status-api";

export const load: PageServerLoad = async (event) => {
  const { params } = event;
  await ensureProjectExists(event, params.id);
  const statuses = await createProjectStatusApiForEvent(event).projectStatuses.list({
    projectId: params.id,
  });
  return { statuses, projectId: params.id };
};

export const actions: Actions = {
  create: async (event) => {
    const { params, request } = event;
    const fd = await request.formData();
    const name = (fd.get("name") as string | null)?.trim();
    const color = (fd.get("color") as string | null)?.trim() || "#6b7280";
    const isFinal = fd.get("isFinal") === "on";
    if (!name) return fail(400, { error: "Name is required" });
    await createProjectStatusApiForEvent(event).projectStatuses.create({
      projectId: params.id,
      name,
      color,
      isFinal,
    });
    return { success: true };
  },
  update: async (event) => {
    const fd = await event.request.formData();
    const id = fd.get("id") as string | null;
    if (!id) return fail(400, { error: "id required" });
    const name = fd.get("name") as string | null;
    const color = fd.get("color") as string | null;
    const isFinalRaw = fd.get("isFinal");
    const sortOrderRaw = fd.get("sortOrder") as string | null;
    await createProjectStatusApiForEvent(event).projectStatuses.update({
      projectId: event.params.id,
      id,
      ...(name ? { name: name.trim() } : {}),
      ...(color ? { color: color.trim() } : {}),
      ...(isFinalRaw != null ? { isFinal: isFinalRaw === "on" } : {}),
      ...(sortOrderRaw != null ? { sortOrder: Number(sortOrderRaw) } : {}),
    });
    return { success: true };
  },
  delete: async (event) => {
    const fd = await event.request.formData();
    const id = fd.get("id") as string | null;
    if (!id) return fail(400, { error: "id required" });
    await createProjectStatusApiForEvent(event).projectStatuses.delete({
      projectId: event.params.id,
      id,
    });
    return { success: true };
  },
};
