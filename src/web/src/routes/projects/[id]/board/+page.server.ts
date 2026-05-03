import { error } from "@sveltejs/kit";
import { fail } from "@sveltejs/kit";
import * as v from "valibot";
import type { Actions, PageServerLoad } from "./$types";
import { listBoardTasks } from "$lib/product-queries";
import { getDefaultOrgId, openProductDb } from "$lib/server/db";
import { actionFail, actionOk } from "$lib/feedback/action-result";
import { BoardMoveSchema } from "$lib/server/boards.schema";
import { moveTaskStatusAction } from "$lib/server/tasks";

interface ProjectRow {
  id: string;
  name: string;
}

export const load: PageServerLoad = async ({ params }) => {
  const db = await openProductDb();
  try {
    const orgId = await getDefaultOrgId(db);
    const rows = await db.query<ProjectRow>(
      `SELECT id, name FROM projects WHERE id = $1 AND org_id = $2`,
      [params.id, orgId],
    );
    const project = rows[0];
    if (!project) throw error(404, "Project not found");

    return {
      project,
      tasks: await listBoardTasks(project.id),
      activeSprintId: null,
    };
  } finally {
    await db.close();
  }
};

function fdToRecord(fd: FormData): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [key, value] of fd.entries()) out[key] = typeof value === "string" ? value : null;
  return out;
}

export const actions: Actions = {
  move: async ({ request }) => {
    const parsed = v.safeParse(BoardMoveSchema, fdToRecord(await request.formData()));
    if (!parsed.success) return fail(400, actionFail("invalid input"));

    const db = await openProductDb();
    try {
      await moveTaskStatusAction(db, parsed.output);
      return actionOk("Task moved");
    } catch (err) {
      const message = (err as Error).message;
      return fail(message.startsWith("status conflict") ? 409 : 400, actionFail(message));
    } finally {
      await db.close();
    }
  },
};
