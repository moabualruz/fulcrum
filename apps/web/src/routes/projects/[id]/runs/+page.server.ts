import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { listProjectRuns } from "@/application/runs/queries.ts";
import { getProjectOrNull } from "@/application/projects/queries.ts";
import { requestAppScope } from "$lib/server/application-scope";

export const load: PageServerLoad = ({ params, locals }) => {
  return {
    projectId: params.id,
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestAppScope(locals, params.id);
        const project = await getProjectOrNull(em, ctx, params.id);
        if (!project) throw error(404, "Project not found");
        const runs = await listProjectRuns(em, ctx);
        return { runs };
      })(),
    },
  };
};
