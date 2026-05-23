import type { PageServerLoad } from "./$types";
import { createAgentRunApiForEvent } from "$lib/server/agent-run-api";
import { ensureProjectExists } from "$lib/server/project-api";

export const load: PageServerLoad = async (event) => {
  const { params, locals } = event;
  await ensureProjectExists(event, params.id);
  return {
    projectId: params.id,
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const runs = await createAgentRunApiForEvent(event).runs.projectRuns({ projectId: params.id });
        return { runs };
      })(),
    },
  };
};
