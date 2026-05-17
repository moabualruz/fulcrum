import type { PageServerLoad } from "./$types";
import { createArtifactApiForEvent, type PublicArtifact, toArtifactRow } from "$lib/server/artifact-api";

export const load: PageServerLoad = (event) => {
  const { params, locals } = event;
  const runId = params.id;

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
