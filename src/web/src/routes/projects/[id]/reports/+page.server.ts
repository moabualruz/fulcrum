import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { loadReports } from "$lib/server/reports";

export const load: PageServerLoad = async ({ params, url }) => {
  const sprintId = url.searchParams.get("sprint") ?? undefined;
  const db = await openProductDb();
  try {
    const orgId = await getDefaultOrgId(db);

    // Verify project exists
    const rows = await db.query<{ id: string; name: string }>(
      `SELECT id, name FROM projects WHERE id = $1 AND org_id = $2`,
      [params.id, orgId],
    );
    if (rows.length === 0) throw error(404, "Project not found");

    const project = rows[0]!;
    const reports = await loadReports(db, project.id, sprintId);

    return { project, reports, selectedSprintId: sprintId ?? null };
  } finally {
    await db.close();
  }
};
