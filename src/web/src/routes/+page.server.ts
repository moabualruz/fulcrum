import type { PageServerLoad } from "./$types";
import { getDefaultOrgId, openProductDb } from "$lib/server/db";
import { loadDashboard } from "$lib/server/dashboard";

export const load: PageServerLoad = ({ locals }) => {
  const projectId = locals?.activeProjectId ?? null;
  return {
    activeProjectId: projectId,
    streamed: {
      dashboard: (async () => {
        const db = await openProductDb();
        try {
          const orgId = await getDefaultOrgId(db);
          return await loadDashboard(db, orgId, projectId);
        } finally {
          await db.close();
        }
      })(),
    },
  };
};
