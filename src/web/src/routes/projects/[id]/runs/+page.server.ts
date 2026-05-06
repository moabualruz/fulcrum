import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { openDatabase, getDefaultOrgId } from "$lib/server/db";
import { loadProjectRuns } from "$lib/server/orchestration";

export const load: PageServerLoad = ({ params, locals }) => {
  return {
    projectId: params.id,
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const db = await openDatabase();
        try {
          const orgId = await getDefaultOrgId(db);
          // Verify project exists
          const projectRows = await db.query<{ id: string }>(
            `SELECT id FROM projects WHERE id = $1 AND org_id = $2`,
            [params.id, orgId],
          );
          if (projectRows.length === 0) throw error(404, "Project not found");
          const runs = await loadProjectRuns(db, orgId, params.id);
          return { runs };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};
