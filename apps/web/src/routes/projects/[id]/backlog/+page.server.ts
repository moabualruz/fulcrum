import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { addTaskToSprint, loadProjectBacklog, removeTaskFromSprint } from "@work-management/interface/project-backlog.ts";
import { requestProjectScope } from "../project-request-scope";

export const load: PageServerLoad = async ({ params, locals }) => {
  try {
    const { em, ctx } = await requestProjectScope(locals, params.id);
    return await loadProjectBacklog(em, ctx);
  } catch {
    throw error(404, "Project not found");
  }
};

export const actions: Actions = {
  addTask: async ({ request, params, locals }) => {
    const fd = await request.formData();
    const sprintId = fd.get("sprintId") as string;
    const taskId = fd.get("taskId") as string;
    if (!sprintId || !taskId) return fail(400, { error: "sprintId and taskId required" });

    try {
      const { em, ctx } = await requestProjectScope(locals, params.id);
      await addTaskToSprint(em, ctx, sprintId, taskId);
      return { ok: true };
    } catch (e) {
      return fail(400, { error: (e as Error).message });
    }
  },
  removeTask: async ({ request, params, locals }) => {
    const fd = await request.formData();
    const sprintId = fd.get("sprintId") as string;
    const taskId = fd.get("taskId") as string;
    if (!sprintId || !taskId) return fail(400, { error: "sprintId and taskId required" });

    try {
      const { em, ctx } = await requestProjectScope(locals, params.id);
      await removeTaskFromSprint(em, ctx, sprintId, taskId);
      return { ok: true };
    } catch (e) {
      return fail(400, { error: (e as Error).message });
    }
  },
};
