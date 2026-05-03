import type { PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { loadOrchestrationDashboard } from "$lib/server/orchestration";

export const load: PageServerLoad = ({ locals }) => {
  return {
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const db = await openProductDb();
        try {
          const orgId = await getDefaultOrgId(db);
          return await loadOrchestrationDashboard(db, orgId);
        } finally {
          await db.close();
        }
      })(),
    },
  };
};
