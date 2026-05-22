import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
  addBacklogTaskToSprintForEvent,
  loadProjectBacklogForEvent,
  removeBacklogTaskFromSprintForEvent,
} from "$lib/server/project-api";

export const load: PageServerLoad = async (event) => {
  try {
    return await loadProjectBacklogForEvent(event, event.params.id);
  } catch {
    throw error(404, "Project not found");
  }
};

export const actions: Actions = {
  addTask: async (event) => {
    const fd = await event.request.formData();
    const sprintId = fd.get("sprintId") as string;
    const taskId = fd.get("taskId") as string;
    if (!sprintId || !taskId) return fail(400, { error: "sprintId and taskId required" });

    try {
      await addBacklogTaskToSprintForEvent(event, { projectId: event.params.id, sprintId, taskId });
      return { ok: true };
    } catch (e) {
      return fail(400, { error: (e as Error).message });
    }
  },
  removeTask: async (event) => {
    const fd = await event.request.formData();
    const sprintId = fd.get("sprintId") as string;
    const taskId = fd.get("taskId") as string;
    if (!sprintId || !taskId) return fail(400, { error: "sprintId and taskId required" });

    try {
      await removeBacklogTaskFromSprintForEvent(event, { projectId: event.params.id, sprintId, taskId });
      return { ok: true };
    } catch (e) {
      return fail(400, { error: (e as Error).message });
    }
  },
};
