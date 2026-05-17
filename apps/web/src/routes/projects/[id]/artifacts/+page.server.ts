import type { PageServerLoad } from "./$types";
import {
  artifactStatsFromRows,
  createArtifactApiForEvent,
  type PublicArtifact,
  toArtifactRow,
} from "$lib/server/artifact-api";

export const load: PageServerLoad = (event) => {
  const { params, locals } = event;
  const projectId = params.id;

  return {
    projectId,
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const artifactApi = createArtifactApiForEvent(event).artifacts;
        const [visibleArtifacts, statsArtifacts] = await Promise.all([
          artifactApi.list({ projectId, archived: false }),
          artifactApi.list({ projectId }),
        ]);
        return {
          artifacts: (visibleArtifacts as PublicArtifact[]).map(toArtifactRow),
          stats: artifactStatsFromRows(statsArtifacts as PublicArtifact[]),
        };
      })(),
    },
  };
};
