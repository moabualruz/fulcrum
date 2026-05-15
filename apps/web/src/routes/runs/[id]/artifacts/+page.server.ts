import type { PageServerLoad } from "./$types";
import { requestAppScope } from "$lib/server/application-scope";
import { listArtifactRows } from "@workflow-coordination/application/artifacts/queries.ts";

export const load: PageServerLoad = ({ params, locals }) => {
  const runId = params.id;

  return {
    runId,
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null, null, runId);
        const artifacts = await listArtifactRows(em, ctx, { runId });
        return { artifacts };
      })(),
    },
  };
};
