import { error, fail } from "@sveltejs/kit";
import * as v from "valibot";
import type { Actions, PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { listSprintTasks } from "$lib/product-queries";
import { createTaskAction } from "$lib/server/tasks";
import { moveTaskStatusAction } from "$lib/server/tasks";
import { BoardCreateSchema, BoardMoveSchema } from "$lib/server/boards.schema";
import { actionOk, actionFail } from "$lib/feedback/action-result";

interface SprintRow {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  capacity: number;
  start_date: string | Date | null;
  end_date: string | Date | null;
  project_id: string;
}

export const load: PageServerLoad = async ({ params }) => {
  const { id: projectId, sid: sprintId } = params;
  const db = await openProductDb();
  try {
    const rows = await db.query<SprintRow>(
      `SELECT id, name, goal, status, capacity, start_date, end_date, project_id
         FROM sprints WHERE id = $1 AND project_id = $2`,
      [sprintId, projectId],
    );
    if (rows.length === 0) throw error(404, "Sprint not found");
    const row = rows[0]!;
    const sprint = {
      ...row,
      start_date: row.start_date instanceof Date ? row.start_date.toISOString() : row.start_date,
      end_date: row.end_date instanceof Date ? row.end_date.toISOString() : row.end_date,
    };

    return {
      projectId,
      sprint,
      streamed: {
        data: (async () => ({ tasks: await listSprintTasks(sprintId) }))(),
      },
    };
  } finally {
    await db.close();
  }
};

function fdToRecord(fd: FormData): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [k, vRaw] of fd.entries()) {
    out[k] = typeof vRaw === "string" ? vRaw : null;
  }
  return out;
}

export const actions: Actions = {
  /** Quick-add task directly into this sprint. */
  create: async ({ request, params }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const parsed = v.safeParse(BoardCreateSchema, { ...raw, projectId: params.id });
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const db = await openProductDb();
    try {
      const orgId = await getDefaultOrgId(db);
      const result = await createTaskAction(db, {
        orgId,
        projectId: params.id,
        title: parsed.output.title,
        status: parsed.output.status,
      });
      // Assign to sprint
      await db.query(
        `UPDATE tasks SET sprint_id = $1, updated_at = now() WHERE id = $2`,
        [params.sid, result.id],
      );
      return actionOk("Task created");
    } finally {
      await db.close();
    }
  },

  /** Move task between statuses on sprint board. */
  move: async ({ request }) => {
    const fd = await request.formData();
    const parsed = v.safeParse(BoardMoveSchema, fdToRecord(fd));
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const db = await openProductDb();
    try {
      await moveTaskStatusAction(db, parsed.output);
      return actionOk("Task moved");
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.startsWith("status conflict")) return fail(409, actionFail(msg));
      return fail(400, actionFail(msg));
    } finally {
      await db.close();
    }
  },
};
