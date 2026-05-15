import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { loadProjectCalendar, rescheduleProjectTask } from "@work-management/interface/project-timeline.ts";
import { actionFail, actionOk } from "../../../../lib/feedback/action-result";
import { requestProjectScope } from "../project-request-scope";

export const load: PageServerLoad = async ({ params, locals }) => {
  const projectId = params.id;
  const { em, ctx } = await requestProjectScope(locals, projectId);
  return loadProjectCalendar(em, ctx);
};

export const actions: Actions = {
  reschedule: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const id = fd.get("id");
    const start_date = fd.get("start_date");
    const due_date = fd.get("due_date");

    if (typeof id !== "string" || !id) return fail(400, actionFail("missing id"));

    try {
      const { em, ctx } = await requestProjectScope(locals, params.id);
      await rescheduleProjectTask(em, ctx, {
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
