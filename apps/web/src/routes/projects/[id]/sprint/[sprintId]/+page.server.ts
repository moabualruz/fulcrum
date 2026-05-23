import { error, fail } from "@sveltejs/kit";
import * as v from "valibot";
import type { Actions, PageServerLoad } from "./$types";
import { actionFail, actionOk } from "$lib/feedback/action-result";
import { BoardMoveSchema } from "$lib/server/boards.schema";
import { createSprintApiForEvent } from "$lib/server/sprint-api";

type SprintDetail = {
  project: { id: string; name: string };
  sprint: { id: string; name: string; goal: string | null; start_date: string; end_date: string; status: string };
  tasks: unknown[];
};

export const load: PageServerLoad = async (event) => {
  try {
    return (await createSprintApiForEvent(event).sprints.loadProjectSprintDetail({
      id: event.params.sprintId,
      projectId: event.params.id,
    })) as SprintDetail;
  } catch (err) {
    const message = (err as Error).message;
    throw error(404, message.includes("Sprint") ? "Sprint not found" : "Project not found");
  }
};

function fdToRecord(fd: FormData): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [key, value] of fd.entries()) out[key] = typeof value === "string" ? value : null;
  return out;
}

export const actions: Actions = {
  create: async (event) => {
    const fd = await event.request.formData();
    const title = String(fd.get("title") ?? "").trim();
    const status = String(fd.get("status") ?? "pending");
    if (!title) return fail(400, actionFail("Title required"));

    try {
      await createSprintApiForEvent(event).sprints.createProjectSprintTask({
        id: event.params.sprintId,
        projectId: event.params.id,
        title,
        status,
      });
      return actionOk("Task created");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    }
  },

  move: async (event) => {
    const parsed = v.safeParse(BoardMoveSchema, fdToRecord(await event.request.formData()));
    if (!parsed.success) return fail(400, actionFail("invalid input"));

    try {
      await createSprintApiForEvent(event).sprints.updateProjectSprintTask({
        taskId: parsed.output.id,
        projectId: event.params.id,
        status: parsed.output.to,
      });
      return actionOk("Task moved");
    } catch (err) {
      const msg = (err as Error).message;
      return fail(msg.startsWith("status conflict") ? 409 : 400, actionFail(msg));
    }
  },

  updateGoal: async (event) => {
    const fd = await event.request.formData();
    const goal = String(fd.get("goal") ?? "");

    await createSprintApiForEvent(event).sprints.updateProjectSprintGoal({
      id: event.params.sprintId,
      goal,
    });
    return actionOk("Goal updated");
  },

  closeSprint: async (event) => {
    await createSprintApiForEvent(event).sprints.completeProjectSprint({ id: event.params.sprintId });
    return actionOk("Sprint closed");
  },
};
