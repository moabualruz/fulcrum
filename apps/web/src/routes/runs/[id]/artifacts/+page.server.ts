import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { createArtifactApiForEvent, type PublicArtifact, toArtifactRow } from "$lib/server/artifact-api";
import { createAgentRunApiForEvent } from "$lib/server/agent-run-api";

export const load: PageServerLoad = async (event) => {
  const { params, locals } = event;
  const runId = params.id;

  try {
    await createAgentRunApiForEvent(event).runs.pageDetail({
      id: runId,
      projectId: locals?.activeProjectId ?? null,
    });
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
