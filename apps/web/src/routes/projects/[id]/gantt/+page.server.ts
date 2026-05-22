import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { actionFail, actionOk } from "../../../../lib/feedback/action-result";
import { createProjectTimelineApiForEvent } from "$lib/server/project-timeline-api";

export const load: PageServerLoad = async (event) => {
  const projectId = event.params.id;
  try {
    return await createProjectTimelineApiForEvent(event).timeline.gantt({ projectId });
  } catch {
    // The page contract treats any timeline failure (missing project, server
    // error) as a 404 — preserved verbatim from the retired in-process route.
    throw error(404, "Project not found");
  }
};

export const actions: Actions = {
  reschedule: async (event) => {
    const fd = await event.request.formData();
    const id = fd.get("id");
    const start_date = fd.get("start_date");
    const due_date = fd.get("due_date");

    if (typeof id !== "string" || !id) return fail(400, actionFail("missing id"));

    try {
      await createProjectTimelineApiForEvent(event).timeline.reschedule({
        projectId: event.params.id,
        taskId: id,
        ...(typeof start_date === "string" && start_date ? { startDate: start_date } : {}),
        ...(typeof due_date === "string" && due_date ? { dueDate: due_date } : {}),
      });
      return actionOk("Rescheduled");
    } catch {
      return fail(500, actionFail("reschedule failed"));
    }
  },
};
