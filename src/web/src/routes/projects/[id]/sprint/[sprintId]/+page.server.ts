import { error, fail } from "@sveltejs/kit";
import * as v from "valibot";
import type { Actions, PageServerLoad } from "./$types";
import { listBoardTasks } from "$lib/product-queries";
import { getDefaultOrgId, openDatabase } from "$lib/server/db";
import { actionFail, actionOk } from "$lib/feedback/action-result";
import { BoardMoveSchema } from "$lib/server/boards.schema";
import { createTaskAction, moveTaskStatusAction } from "$lib/server/tasks";

interface ProjectRow {
  id: string;
  name: string;
}

interface SprintRow {
  id: string;
  name: string;
  goal: string | null;
  start_date: string | Date;
  end_date: string | Date;
  status: string;
}

export const load: PageServerLoad = async ({ params }) => {
  const db = await openDatabase();
  try {
    const orgId = await getDefaultOrgId(db);

    const projectRows = await db.query<ProjectRow>(
      `SELECT id, name FROM projects WHERE id = $1 AND org_id = $2`,
      [params.id, orgId],
    );
    const project = projectRows[0];
    if (!project) throw error(404, "Project not found");

    const sprintRows = await db.query<SprintRow>(
      `SELECT id, name, goal, start_date, end_date, status
         FROM sprints
        WHERE id = $1 AND project_id = $2`,
      [params.sprintId, project.id],
    );
    const sprintRow = sprintRows[0];
    if (!sprintRow) throw error(404, "Sprint not found");

    const sprint = {
      id: sprintRow.id,
      name: sprintRow.name,
      goal: sprintRow.goal,
      start_date: String(sprintRow.start_date).slice(0, 10),
      end_date: String(sprintRow.end_date).slice(0, 10),
      status: sprintRow.status,
    };

    const allTasks = await listBoardTasks(project.id);
    const tasks = allTasks.filter((t) => t.sprint_id === params.sprintId);

    return { project, sprint, tasks };
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
  create: async ({ request, params }) => {
    const fd = await request.formData();
    const title = String(fd.get("title") ?? "").trim();
    const status = String(fd.get("status") ?? "pending");
    if (!title) return fail(400, actionFail("Title required"));

    const db = await openDatabase();
    try {
      const orgId = await getDefaultOrgId(db);
      const task = await createTaskAction(db, {
        orgId,
        projectId: params.id,
        title,
        status: status as never,
      });
      await db.query(`UPDATE tasks SET sprint_id = $1, updated_at = now() WHERE id = $2`, [
        params.sprintId,
        task.id,
      ]);
      return actionOk("Task created");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    } finally {
      await db.close();
    }
  },

  move: async ({ request }) => {
    const parsed = v.safeParse(BoardMoveSchema, fdToRecord(await request.formData()));
    if (!parsed.success) return fail(400, actionFail("invalid input"));

    const db = await openDatabase();
    try {
      await moveTaskStatusAction(db, parsed.output);
      return actionOk("Task moved");
    } catch (err) {
      const msg = (err as Error).message;
      return fail(msg.startsWith("status conflict") ? 409 : 400, actionFail(msg));
    } finally {
      await db.close();
    }
  },

  updateGoal: async ({ request, params }) => {
    const fd = await request.formData();
    const goal = String(fd.get("goal") ?? "");

    const db = await openDatabase();
    try {
      await db.query(`UPDATE sprints SET goal = $1 WHERE id = $2`, [goal, params.sprintId]);
      return actionOk("Goal updated");
    } finally {
      await db.close();
    }
  },

  closeSprint: async ({ params }) => {
    const db = await openDatabase();
    try {
      await db.query(
        `UPDATE sprints SET status = 'completed' WHERE id = $1`,
        [params.sprintId],
      );
      // Move incomplete tasks to backlog (clear sprint_id)
      await db.query(
        `UPDATE tasks SET sprint_id = NULL WHERE sprint_id = $1 AND status NOT IN ('completed', 'cancelled')`,
        [params.sprintId],
      );
      return actionOk("Sprint closed");
    } finally {
      await db.close();
    }
  },
};
