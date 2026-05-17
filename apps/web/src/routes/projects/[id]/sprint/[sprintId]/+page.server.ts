import { error, fail } from "@sveltejs/kit";
import * as v from "valibot";
import type { Actions, PageServerLoad } from "./$types";
import { actionFail, actionOk } from "$lib/feedback/action-result";
import { BoardMoveSchema } from "$lib/server/boards.schema";
import {
  completeProjectSprint,
  createProjectTask,
  loadProjectSprintDetail,
  updateProjectTask,
  updateSprintGoal,
} from "@work-management/interface/project-sprints.ts";
import { requestProjectScope } from "../../../project-request-scope";

export const load: PageServerLoad = async ({ params, locals }) => {
  try {
    const { em, ctx } = await requestProjectScope(locals, params.id);
    return await loadProjectSprintDetail(em, ctx, params.sprintId);
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
  create: async ({ request, params, locals }) => {
    const fd = await request.formData();
    const title = String(fd.get("title") ?? "").trim();
    const status = String(fd.get("status") ?? "pending");
    if (!title) return fail(400, actionFail("Title required"));

    try {
      const { em, ctx } = await requestProjectScope(locals, params.id);
      await createProjectTask(em, ctx, {
        title,
        status: status as never,
        sprintId: params.sprintId,
      });
      return actionOk("Task created");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    }
  },

  move: async ({ request, params, locals }) => {
    const parsed = v.safeParse(BoardMoveSchema, fdToRecord(await request.formData()));
    if (!parsed.success) return fail(400, actionFail("invalid input"));

    try {
      const { em, ctx } = await requestProjectScope(locals, params.id);
      await updateProjectTask(em, ctx, parsed.output.id, { status: parsed.output.to });
      return actionOk("Task moved");
    } catch (err) {
      const msg = (err as Error).message;
      return fail(msg.startsWith("status conflict") ? 409 : 400, actionFail(msg));
    }
  },

  updateGoal: async ({ request, params, locals }) => {
    const fd = await request.formData();
    const goal = String(fd.get("goal") ?? "");

    const { em, ctx } = await requestProjectScope(locals, params.id);
    await updateSprintGoal(em, ctx, params.sprintId, goal);
    return actionOk("Goal updated");
  },

  closeSprint: async ({ params, locals }) => {
    const { em, ctx } = await requestProjectScope(locals, params.id);
    await completeProjectSprint(em, ctx, params.sprintId);
    return actionOk("Sprint closed");
  },
};
