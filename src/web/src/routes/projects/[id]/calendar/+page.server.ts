import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { openDatabase } from "../../../../lib/server/db";
import { updateTaskAction } from "../../../../lib/server/tasks";
import { actionFail, actionOk } from "../../../../lib/feedback/action-result";

export const load: PageServerLoad = async ({ params }) => {
  const projectId = params.id;
  const db = await openDatabase();
  try {
    // start_date/due_date may not exist; NULL until migration adds them
    const tasks = await db.query<{
      id: string;
      title: string;
      status: string | null;
      priority: number | null;
      start_date: string | null;
      due_date: string | null;
      updated_at: string;
    }>(
      `SELECT t.id, t.title, t.status, t.priority,
              NULL::text AS start_date,
              NULL::text AS due_date,
              t.updated_at
       FROM tasks t
       WHERE t.project_id = $1
         AND t.deleted_at IS NULL
       ORDER BY t.created_at`,
      [projectId],
    );

    // Active sprint for overlay (D-65)
    let activeSprint: {
      id: string;
      name: string | null;
      start_date: string;
      end_date: string;
    } | null = null;

    try {
      const sprints = await db.query<{
        id: string;
        name: string | null;
        start_date: string | null;
        end_date: string | null;
      }>(
        `SELECT s.id, s.name, s.start_date, s.end_date
         FROM sprints s
         WHERE s.project_id = $1
           AND s.status = 'active'
         ORDER BY s.start_date DESC
         LIMIT 1`,
        [projectId],
      );

      const sprint = sprints[0];
      if (sprint?.start_date && sprint.end_date) {
        activeSprint = {
          id: sprint.id,
          name: sprint.name ?? null,
          start_date: String(sprint.start_date).slice(0, 10),
          end_date: String(sprint.end_date).slice(0, 10),
        };
      }
    } catch {
      // sprints table may not be available
    }

    return {
      projectId,
      project: { id: projectId },
      tasks,
      activeSprint,
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
