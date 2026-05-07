import type { PageServerLoad } from "./$types";
import { loadDashboard } from "$lib/server/dashboard";
import { requestAppScope } from "$lib/server/application-scope";

export const load: PageServerLoad = ({ locals }) => {
  const projectId = locals?.activeProjectId ?? null;
  return {
    activeProjectId: projectId,
    streamed: {
      dashboard: (async () => {
        const { em, ctx } = await requestAppScope(locals, projectId);
        return await loadDashboard(em, ctx.orgId, projectId);
      })(),
    },
  };
};
