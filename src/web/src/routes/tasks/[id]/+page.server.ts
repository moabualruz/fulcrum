import { error, fail } from "@sveltejs/kit";
import * as v from "valibot";
import type { Actions, PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { getTaskDetail } from "$lib/server/task-detail";
import { updateTaskAction, deleteTaskAction } from "$lib/server/tasks";
import { actionOk, actionFail } from "$lib/feedback/action-result";

export const load: PageServerLoad = ({ params }) => {
  return {
    streamed: {
      data: (async () => {
        const db = await openProductDb();
        try {
          const orgId = await getDefaultOrgId(db);
          const detail = await getTaskDetail(db, params.id, orgId);
          if (!detail) throw error(404, "Task not found");
          return detail;
        } finally {
          await db.close();
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
  update: async ({ request, params }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const candidate: Record<string, unknown> = { ...raw, id: params.id };
    if ("priority" in candidate && candidate["priority"] !== null) {
      candidate["priority"] = Number(candidate["priority"]);
    }
    if (candidate["description"] === "") candidate["description"] = null;
    const parsed = v.safeParse(UpdateFieldSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const db = await openProductDb();
    try {
      await updateTaskAction(db, parsed.output);
      return actionOk("Task updated");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    } finally {
      await db.close();
    }
  },

  delete: async ({ params }) => {
    const db = await openProductDb();
    try {
      await deleteTaskAction(db, params.id);
      return actionOk("Task deleted");
    } finally {
      await db.close();
    }
  },

  autosave: async ({ request, params }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const candidate = { id: params.id, description: raw["description"] ?? null };
    const parsed = v.safeParse(UpdateDescriptionSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const db = await openProductDb();
    try {
      await updateTaskAction(db, { id: parsed.output.id, description: parsed.output.description });
      return actionOk("Saved");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    } finally {
      await db.close();
    }
  },
};
