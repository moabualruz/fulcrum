import type { PageServerLoad } from "./$types";
import { getArtifactStats, listArtifactRows } from "@/application/artifacts/queries.ts";
import { requestAppScope } from "$lib/server/application-scope";

export const load: PageServerLoad = ({ params, locals }) => {
  const projectId = params.id;

  return {
    projectId,
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestAppScope(locals, projectId);
        const [artifacts, stats] = await Promise.all([
          listArtifactRows(em, ctx, { projectId }),
          getArtifactStats(em, ctx, projectId),
        ]);
        return { artifacts, stats };
      })(),
    },
  };
};
