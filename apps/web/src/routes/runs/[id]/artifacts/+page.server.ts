import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { createArtifactApiForEvent, type PublicArtifact, toArtifactRow } from "$lib/server/artifact-api";
import { getProjectRunPageData } from "@execution-orchestration/interface/run-pages.ts";
import { requestServiceScope } from "$lib/server/request-service-scope";

export const load: PageServerLoad = async (event) => {
  const { params, locals } = event;
  const runId = params.id;

  const { em, ctx } = await requestServiceScope(locals, locals?.activeProjectId ?? null, null, runId);
  try {
    await getProjectRunPageData(em, ctx, runId);
  } catch {
    throw error(404, "Run not found");
  }

  return {
    runId,
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const artifacts = await createArtifactApiForEvent(event).artifacts.list({
          runId,
          archived: false,
        }) as PublicArtifact[];
        return { artifacts: artifacts.map(toArtifactRow) };
      })(),
    },
  };
};
