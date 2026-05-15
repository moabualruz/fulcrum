import type { PageServerLoad } from "./$types";
import { listProjectRuns } from "@execution-orchestration/interface/run-pages.ts";
import { requestAppScope } from "$lib/server/application-scope";
import { ensureProjectExists } from "$lib/server/project-api";

export const load: PageServerLoad = (event) => {
  const { params, locals } = event;
  return {
    projectId: params.id,
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        await ensureProjectExists(event, params.id);
        const { em, ctx } = await requestAppScope(locals, params.id);
        const runs = await listProjectRuns(em, ctx);
        return { runs };
      })(),
    },
  };
};
