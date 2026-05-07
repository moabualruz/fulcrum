import { error, fail } from "@sveltejs/kit";
import * as v from "valibot";
import type { Actions, PageServerLoad } from "./$types";
import { deleteTask, updateTask } from "@/application/tasks/commands.ts";
import { getTask, listChildren } from "@/application/tasks/queries.ts";
import { actionOk, actionFail } from "$lib/feedback/action-result";
import { requestAppScope } from "$lib/server/application-scope";

export const load: PageServerLoad = ({ params, locals }) => {
  return {
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
        try {
          const task = await getTask(em, ctx, params.id);
          const children = await listChildren(em, ctx, params.id);
          return { task, children };
        } catch (err) {
          if ((err as Error).message.includes("not found")) throw error(404, "Task not found");
          throw err;
        }
      })(),
    },
  };
};

const UpdateDescriptionSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  description: v.union([v.string(), v.null_()]),
});

const UpdateFieldSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  title: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
  status: v.optional(v.picklist(["pending", "in_progress", "blocked", "completed", "cancelled"])),
  priority: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(20))),
  description: v.optional(v.union([v.string(), v.null_()])),
});

function fdToRecord(fd: FormData): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [k, vRaw] of fd.entries()) {
    out[k] = typeof vRaw === "string" ? vRaw : null;
  }
  return out;
}

export const actions: Actions = {
  update: async ({ request, params, locals }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const candidate: Record<string, unknown> = { ...raw, id: params.id };
    if ("priority" in candidate && candidate["priority"] !== null) {
      candidate["priority"] = Number(candidate["priority"]);
    }
    if (candidate["description"] === "") candidate["description"] = null;
    const parsed = v.safeParse(UpdateFieldSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
    try {
      const { id: _id, ...input } = parsed.output;
      await updateTask(em, ctx, params.id, input);
      return actionOk("Task updated");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    }
  },

  delete: async ({ params, locals }) => {
    const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
    await deleteTask(em, ctx, params.id);
    return actionOk("Task deleted");
  },

  autosave: async ({ request, params, locals }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const candidate = { id: params.id, description: raw["description"] ?? null };
    const parsed = v.safeParse(UpdateDescriptionSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
    try {
      await updateTask(
        em,
        ctx,
        params.id,
        { description: parsed.output.description },
      );
      return actionOk("Saved");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    }
  },
};
