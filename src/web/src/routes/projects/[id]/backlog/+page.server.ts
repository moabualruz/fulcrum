import { error, fail } from "@sveltejs/kit";
import * as v from "valibot";
import type { Actions, PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { listBacklogTasks, listSprints } from "$lib/product-queries";
import { assignTaskToSprintAction } from "$lib/server/sprints";
import { createTaskAction } from "$lib/server/tasks";
import { AssignTaskSchema } from "$lib/server/sprints.schema";
import { BoardCreateSchema } from "$lib/server/boards.schema";
import { actionOk, actionFail } from "$lib/feedback/action-result";

export const load: PageServerLoad = async ({ params }) => {
  const projectId = params.id;
  return {
    projectId,
    streamed: {
      data: (async () => {
        const [tasks, sprints] = await Promise.all([
          listBacklogTasks(projectId),
          listSprints(projectId),
        ]);
        return { tasks, sprints };
      })(),
    },
  };
};

function fdToRecord(fd: FormData): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [k, vRaw] of fd.entries()) {
    out[k] = typeof vRaw === "string" ? vRaw : null;
  }
  return out;
}

export const actions: Actions = {
  /** Assign task to sprint (drag from backlog → sprint panel). */
  assign: async ({ request }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const candidate: Record<string, unknown> = { ...raw };
    if (candidate["sprintId"] === "") candidate["sprintId"] = null;
    const parsed = v.safeParse(AssignTaskSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const db = await openProductDb();
    try {
      await assignTaskToSprintAction(db, parsed.output.taskId, parsed.output.sprintId);
      return actionOk("Task assigned");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    } finally {
      await db.close();
    }
  },

  /** Quick-add task to backlog. */
  create: async ({ request, params }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const parsed = v.safeParse(BoardCreateSchema, { ...raw, projectId: params.id });
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const db = await openProductDb();
    try {
      const orgId = await getDefaultOrgId(db);
      await createTaskAction(db, {
        orgId,
        projectId: params.id,
        title: parsed.output.title,
        status: parsed.output.status,
      });
      return actionOk("Task created");
    } finally {
      await db.close();
    }
  },
};
