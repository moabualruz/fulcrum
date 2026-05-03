import { error } from "@sveltejs/kit";
import { fail } from "@sveltejs/kit";
import * as v from "valibot";
import type { Actions, PageServerLoad } from "./$types";
import { listBoardTasks } from "$lib/product-queries";
import { getDefaultOrgId, openProductDb } from "$lib/server/db";
import { actionFail, actionOk } from "$lib/feedback/action-result";
import { BoardMoveSchema } from "$lib/server/boards.schema";
import { moveTaskStatusAction, updateTaskAction } from "$lib/server/tasks";
import {
  decodeSavedViewFormValue,
  decodeSavedViewParam,
  normalizeSavedViewQuery,
  type SavedViewQuery,
  type SavedViewScope,
  type SavedViewType,
} from "$lib/components/saved-views/saved-view-query";

interface ProjectRow {
  id: string;
  name: string;
}

interface SprintRow {
  id: string;
  name: string;
  start_date: string | Date;
  end_date: string | Date;
}

interface SavedViewRow {
  id: string;
  name: string;
  scope: SavedViewScope;
  view_type: SavedViewType;
  query_json: unknown;
  default_for: string | null;
}

interface UserRow {
  id: string;
}

async function listSavedViews(db: Awaited<ReturnType<typeof openProductDb>>, orgId: string, projectId: string) {
  const rows = await db.query<SavedViewRow>(
    `SELECT id, name, scope, view_type, query_json, default_for
       FROM saved_views
      WHERE org_id = $1
        AND (project_id = $2 OR project_id IS NULL)
        AND scope IN ('private', 'project', 'org')
      ORDER BY updated_at DESC, name ASC`,
    [orgId, projectId],
  ).catch(() => []);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    scope: row.scope,
    viewType: row.view_type,
    queryJson: normalizeSavedViewQuery(row.query_json),
    defaultFor: row.default_for,
  }));
}

async function firstUserId(db: Awaited<ReturnType<typeof openProductDb>>): Promise<string> {
  const rows = await db.query<UserRow>(`SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1`);
  const user = rows[0];
  if (!user) throw new Error("No user exists for saved view ownership");
  return user.id;
}

export const load: PageServerLoad = async ({ params, url }) => {
  const db = await openProductDb();
  try {
    const orgId = await getDefaultOrgId(db);
    const rows = await db.query<ProjectRow>(
      `SELECT id, name FROM projects WHERE id = $1 AND org_id = $2`,
      [params.id, orgId],
    );
    const project = rows[0];
    if (!project) throw error(404, "Project not found");

    const sprintRows = await db.query<SprintRow>(
      `SELECT id, name, start_date, end_date
         FROM sprints
        WHERE project_id = $1 AND status = 'active'
        ORDER BY start_date ASC, id ASC
        LIMIT 1`,
      [project.id],
    ).catch(() => []);
    const activeSprint = sprintRows[0]
      ? {
          id: sprintRows[0].id,
          name: sprintRows[0].name,
          start_date: String(sprintRows[0].start_date).slice(0, 10),
          end_date: String(sprintRows[0].end_date).slice(0, 10),
        }
      : null;

    return {
      project,
      tasks: await listBoardTasks(project.id),
      activeSprintId: activeSprint?.id ?? null,
      activeSprint,
      month: url.searchParams.get("month") ?? new Date().toISOString().slice(0, 10),
      view: url.searchParams.get("view") ?? "board",
      transientQuery: decodeSavedViewParam(url.searchParams.get("view")),
      savedViews: await listSavedViews(db, orgId, project.id),
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
  update: async ({ request }) => {
    const fd = await request.formData();
    const id = String(fd.get("id") ?? "");
    const status = String(fd.get("status") ?? "");

    const db = await openProductDb();
    try {
      await updateTaskAction(db, { id, status: status as never });
      return actionOk("Task updated");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    } finally {
      await db.close();
    }
  },
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
  reschedule: async ({ request }) => {
    const fd = await request.formData();
    const id = String(fd.get("id") ?? "");
    const startDateValue = String(fd.get("start_date") ?? "");
    const dueDateValue = String(fd.get("due_date") ?? "");

    const db = await openProductDb();
    try {
      await updateTaskAction(db, {
        id,
        startDate: fd.has("start_date") ? startDateValue || null : undefined,
        dueDate: fd.has("due_date") ? dueDateValue || null : undefined,
      });
      return actionOk("Task rescheduled");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    } finally {
      await db.close();
    }
  },
  savedView: async ({ request }) => {
    const fd = await request.formData();
    const intent = String(fd.get("intent") ?? "");

    const db = await openProductDb();
    try {
      const orgId = await getDefaultOrgId(db);
      if (intent === "savedViews.create") {
        const name = String(fd.get("name") ?? "").trim();
        const projectId = String(fd.get("project_id") ?? "").trim();
        const scope = String(fd.get("scope") ?? "private") as SavedViewScope;
        const viewType = String(fd.get("view_type") ?? "board") as SavedViewType;
        const queryJson: SavedViewQuery = decodeSavedViewFormValue(String(fd.get("query_json") ?? ""));
        if (!name || !projectId) return fail(400, actionFail("invalid input"));
        const createdBy = await firstUserId(db);
        await db.query(
          `INSERT INTO saved_views (org_id, project_id, name, scope, view_type, query_json, created_by)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
          [orgId, projectId, name, scope, viewType, JSON.stringify(queryJson), createdBy],
        );
        return actionOk("Saved view created");
      }
      return fail(400, actionFail("invalid intent"));
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    } finally {
      await db.close();
    }
  },
};
