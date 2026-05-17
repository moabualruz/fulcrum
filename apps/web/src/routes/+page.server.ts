import type { PageServerLoad } from "./$types";
import { loadDashboard } from "$lib/server/dashboard";
import { requestServiceScope } from "$lib/server/request-service-scope";

export const load: PageServerLoad = ({ locals }) => {
  const projectId = locals?.activeProjectId ?? null;
  return {
    activeProjectId: projectId,
    streamed: {
      dashboard: (async () => {
        const { em, ctx } = await requestServiceScope(locals, projectId);
        return await loadDashboard(em, ctx.orgId, projectId);
      })(),
    },
  };
};
