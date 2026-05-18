import type { PageServerLoad } from "./$types";
import { listProjectRuns } from "@execution-orchestration/interface/run-pages.ts";
import { requestServiceScope } from "$lib/server/request-service-scope";
import { ensureProjectExists } from "$lib/server/project-api";

export const load: PageServerLoad = async (event) => {
  const { params, locals } = event;
  await ensureProjectExists(event, params.id);
  return {
    projectId: params.id,
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestServiceScope(locals, params.id);
        const runs = await listProjectRuns(em, ctx);
        return { runs };
      })(),
    },
  };
};
