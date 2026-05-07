import { fail } from "@sveltejs/kit";
import * as v from "valibot";
import type { Actions, PageServerLoad } from "./$types";
import {
  createProjectTask,
  deleteProjectTask,
  updateProjectTask,
} from "@/application/projects/commands.ts";
import { listProjectBoardTasks } from "@/application/projects/queries.ts";
import {
  BoardCreateSchema,
  BoardDeleteSchema,
  BoardMoveSchema,
  BoardUpdateSchema,
} from "../../../../lib/server/boards.schema";
import { actionFail, actionOk } from "../../../../lib/feedback/action-result";
import { requestAppScope } from "$lib/server/application-scope";

export const load: PageServerLoad = async ({ params, url, locals }) => {
  const projectId = params.id;
  const sprintFilter = url.searchParams.get("sprint")?.trim() ?? "";
  return {
    projectId,
    sprintFilter,
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestAppScope(locals, projectId);
        return { tasks: await listProjectBoardTasks(em, ctx) };
      })(),
    },
  };
};

function fdToRecord(fd: FormData): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [k, vRaw] of fd.entries()) out[k] = typeof vRaw === "string" ? vRaw : null;
  return out;
}

export const actions: Actions = {
  create: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const candidate: Record<string, unknown> = { ...raw, projectId: params.id };
    const parsed = v.safeParse(BoardCreateSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    try {
      const { em, ctx } = await requestAppScope(locals, params.id);
      await createProjectTask(em, ctx, {
        title: parsed.output.title,
        status: parsed.output.status,
      });
      return actionOk("Task created");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    }
  },

  update: async ({ request, locals }) => {
    const fd = await request.formData();
    const candidate: Record<string, unknown> = { ...fdToRecord(fd) };
    if ("priority" in candidate && candidate["priority"] !== null) {
      candidate["priority"] = Number(candidate["priority"]);
    }
    if (candidate["description"] === "") candidate["description"] = null;
    const parsed = v.safeParse(BoardUpdateSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    try {
      const { em, ctx } = await requestAppScope(locals);
      const { id, ...patch } = parsed.output;
      await updateProjectTask(em, ctx, id, patch);
      return actionOk("Task updated");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    }
  },

  delete: async ({ request, locals }) => {
    const fd = await request.formData();
    const parsed = v.safeParse(BoardDeleteSchema, fdToRecord(fd));
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const { em, ctx } = await requestAppScope(locals);
    await deleteProjectTask(em, ctx, parsed.output.id);
    return actionOk("Task deleted");
  },

  move: async ({ request, locals }) => {
    const fd = await request.formData();
    const parsed = v.safeParse(BoardMoveSchema, fdToRecord(fd));
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    try {
      const { em, ctx } = await requestAppScope(locals);
      await updateProjectTask(em, ctx, parsed.output.id, { status: parsed.output.status });
      return actionOk("Task moved");
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.startsWith("status conflict")) return fail(409, actionFail(msg));
      return fail(400, actionFail(msg));
    }
  },
};
