import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { actionFail, actionOk } from "$lib/feedback/action-result";
import { getDefaultOrgId, openProductDb } from "$lib/server/db";
import { normalizeSavedViewQuery, type SavedViewScope, type SavedViewType } from "$lib/components/saved-views/saved-view-query";

interface ProjectRow {
  id: string;
  name: string;
}

interface SavedViewRow {
  id: string;
  name: string;
  scope: SavedViewScope;
  view_type: SavedViewType;
  query_json: unknown;
  default_for: string | null;
}

export const load: PageServerLoad = async ({ params }) => {
  const db = await openProductDb();
  try {
    const orgId = await getDefaultOrgId(db);
    const project = (await db.query<ProjectRow>(
      `SELECT id, name FROM projects WHERE id = $1 AND org_id = $2`,
      [params.id, orgId],
    ))[0];
    if (!project) throw error(404, "Project not found");

    const rows = await db.query<SavedViewRow>(
      `SELECT id, name, scope, view_type, query_json, default_for
         FROM saved_views
        WHERE org_id = $1
          AND (project_id = $2 OR project_id IS NULL)
        ORDER BY updated_at DESC, name ASC`,
      [orgId, project.id],
    ).catch(() => []);

    return {
      project,
      views: rows.map((row) => ({
        id: row.id,
        name: row.name,
        scope: row.scope,
        viewType: row.view_type,
        queryJson: normalizeSavedViewQuery(row.query_json),
        defaultFor: row.default_for,
      })),
    };
  } finally {
    await db.close();
  }
};

export const actions: Actions = {
  savedView: async ({ request, params }) => {
    const fd = await request.formData();
    const intent = String(fd.get("intent") ?? "");
    const id = String(fd.get("id") ?? "");
    const db = await openProductDb();
    try {
      const orgId = await getDefaultOrgId(db);
      if (intent === "savedViews.setDefault") {
        const context = String(fd.get("context") ?? "tasks");
        await db.query(
          `UPDATE saved_views SET default_for = NULL, updated_at = now()
            WHERE org_id = $1 AND default_for = $2`,
          [orgId, context],
        );
        await db.query(
          `UPDATE saved_views SET default_for = $1, updated_at = now()
            WHERE id = $2 AND org_id = $3`,
          [context, id, orgId],
        );
        return actionOk("Default saved view updated");
      }
      if (intent === "savedViews.updateScope") {
        const scope = String(fd.get("scope") ?? "private");
        await db.query(
          `UPDATE saved_views SET scope = $1, updated_at = now()
            WHERE id = $2 AND org_id = $3`,
          [scope, id, orgId],
        );
        return actionOk("Saved view scope updated");
      }
      if (intent === "savedViews.delete") {
        await db.query(`DELETE FROM saved_views WHERE id = $1 AND org_id = $2`, [id, orgId]);
        throw redirect(303, `/projects/${params.id}/settings/views`);
      }
      return fail(400, actionFail("invalid intent"));
    } catch (err) {
      if (err instanceof Response) throw err;
      return fail(400, actionFail((err as Error).message));
    } finally {
      await db.close();
    }
  },
};
