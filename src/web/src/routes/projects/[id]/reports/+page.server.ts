/**
 * Reports page server load — uses MikroORM EM from locals (no raw SQL / openDatabase).
 *
 * Pillar 6: Metrics & reporting. Loads report data server-side via EM from locals.
 * Additional tRPC procedures (e.g. reports.burndown) available client-side.
 */

import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { loadReports } from "$lib/server/reports";

export const load: PageServerLoad = async ({ params, url, locals }) => {
  const em = locals.em;
  if (!em) {
    throw error(500, "EntityManager not available");
  }

  const orgId = locals.orgId;
  if (!orgId) {
    throw error(401, "Not authenticated");
  }

  const sprintId = url.searchParams.get("sprint") ?? undefined;

  // Verify project exists
  const rows = await em.getConnection().execute(
    `SELECT id, name FROM projects WHERE id = ? AND org_id = ? AND deleted_at IS NULL`,
    [params.id, orgId],
  ) as Array<{ id: string; name: string }>;

  if (rows.length === 0) throw error(404, "Project not found");

  const project = rows[0]!;
  const reports = await loadReports(em, project.id, sprintId);

  return { project, reports, selectedSprintId: sprintId ?? null, orgId };
};
