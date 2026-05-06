import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { openDatabase } from "../../../../lib/server/db";
import { updateTaskAction } from "../../../../lib/server/tasks";
import { actionFail, actionOk } from "../../../../lib/feedback/action-result";

export const load: PageServerLoad = async ({ params }) => {
  const projectId = params.id;
  const db = await openDatabase();
  try {
    // Fetch tasks — start_date/due_date may not exist yet; COALESCE to NULL
    const tasks = await db.query<{
      id: string;
      title: string;
      status: string | null;
      priority: number | null;
      start_date: string | null;
      due_date: string | null;
      created_at: string;
      updated_at: string;
      sprint_id: string | null;
    }>(
      `SELECT t.id, t.title, t.status, t.priority,
              NULL::text AS start_date,
              NULL::text AS due_date,
              t.created_at, t.updated_at,
              t.sprint_id
       FROM tasks t
       WHERE t.project_id = $1
         AND t.deleted_at IS NULL
       ORDER BY t.created_at`,
      [projectId],
    );

    // Attempt to load relationships; table may not exist in product DB
    let relationships: Array<{ id: string; sourceTaskId: string; targetTaskId: string; type: string }> = [];
    try {
      const rows = await db.query<{
        id: string;
        source_task_id: string;
        target_task_id: string;
        type: string;
      }>(
        `SELECT r.id, r.source_task_id, r.target_task_id, r.type
         FROM task_relationships r
         INNER JOIN tasks t ON t.id = r.source_task_id
         WHERE t.project_id = $1
           AND (r.deleted_at IS NULL OR r.deleted_at > now())`,
        [projectId],
      );
      relationships = rows.map((r) => ({
        id: r.id,
        sourceTaskId: r.source_task_id,
        targetTaskId: r.target_task_id,
        type: r.type,
      }));
    } catch {
      // table not present in this DB instance; no dependency arrows
    }

    return {
      projectId,
      project: { id: projectId },
      tasks,
      relationships,
    };
  } finally {
    await db.close();
  }
};

export const actions: Actions = {
  reschedule: async ({ request }) => {
    const fd = await request.formData();
    const id = fd.get("id");
    const start_date = fd.get("start_date");
    const due_date = fd.get("due_date");

    if (typeof id !== "string" || !id) return fail(400, actionFail("missing id"));

    const db = await openDatabase();
    try {
      await updateTaskAction(db, {
        id,
        ...(typeof start_date === "string" && start_date ? { startDate: start_date } : {}),
        ...(typeof due_date === "string" && due_date ? { dueDate: due_date } : {}),
      });
      return actionOk("Rescheduled");
    } catch {
      return fail(500, actionFail("reschedule failed"));
    } finally {
      await db.close();
    }
  },
};
