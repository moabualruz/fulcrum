import type { PageServerLoad } from "./$types";
import { loadDashboard } from "$lib/server/dashboard";
import { getEm, getDefaultOrgIdOrm } from "$lib/server/em";

export const load: PageServerLoad = ({ locals }) => {
  const projectId = locals?.activeProjectId ?? null;
  return {
    activeProjectId: projectId,
    streamed: {
      dashboard: (async () => {
        const em = locals.em ?? await getEm();
        const orgId = locals.orgId ?? await getDefaultOrgIdOrm(em);
        return await loadDashboard(em, orgId, projectId);
      })(),
    },
  };
};
