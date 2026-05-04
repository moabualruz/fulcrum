import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import {
  addTaskToSprintAction,
  removeTaskFromSprintAction,
} from "$lib/server/sprints";

export const load: PageServerLoad = async ({ params }) => {
  const db = await openProductDb();
  try {
    const orgId = await getDefaultOrgId(db);
    // Verify project exists
    const projectRows = await db.query<{ id: string; name: string }>(
      `SELECT id, name FROM projects WHERE id = $1 AND org_id = $2`,
      [params.id, orgId],
    );
    if (projectRows.length === 0) throw error(404, "Project not found");
    const project = projectRows[0]!;

    // Load sprints for this project
    const sprints = await db.query<{
      id: string; name: string; status: string; capacity_points: number | null;
    }>(
      `SELECT id, name, status, capacity_points
         FROM sprints WHERE project_id = $1 ORDER BY created_at DESC, id ASC`,
      [params.id],
    );

    // Backlog = unsprinted, non-completed tasks
    const backlogTasks = await db.query<{
      id: string; title: string; status: string; priority: number;
      estimate_points: number | null; sprint_id: string | null;
    }>(
      `SELECT id, title, status, priority, estimate_points, sprint_id
         FROM tasks
         WHERE project_id = $1 AND sprint_id IS NULL
           AND status NOT IN ('completed', 'cancelled')
         ORDER BY priority DESC, updated_at DESC, id ASC`,
      [params.id],
    );

    // If a sprint is selected (via query param), load its tasks
    return {
      project: { id: project.id, name: project.name },
      sprints,
      backlogTasks,
    };
  } finally {
    await db.close();
  }
};

export const actions: Actions = {
  addTask: async ({ request, params }) => {
    const fd = await request.formData();
    const sprintId = fd.get("sprintId") as string;
    const taskId = fd.get("taskId") as string;
    if (!sprintId || !taskId) return fail(400, { error: "sprintId and taskId required" });

    const db = await openProductDb();
    try {
      await addTaskToSprintAction(db, { sprintId, taskId });
      return { ok: true };
    } catch (e) {
      return fail(400, { error: (e as Error).message });
    } finally {
      await db.close();
    }
  },
  removeTask: async ({ request }) => {
    const fd = await request.formData();
    const sprintId = fd.get("sprintId") as string;
    const taskId = fd.get("taskId") as string;
    if (!sprintId || !taskId) return fail(400, { error: "sprintId and taskId required" });

    const db = await openProductDb();
    try {
      await removeTaskFromSprintAction(db, { sprintId, taskId });
      return { ok: true };
    } catch (e) {
      return fail(400, { error: (e as Error).message });
    } finally {
      await db.close();
    }
  },
};
