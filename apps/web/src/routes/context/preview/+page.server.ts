import type { PageServerLoad } from "./$types";
import { createContextPreviewApiForEvent } from "$lib/server/context-preview-api";

export const load: PageServerLoad = (event) => {
  const { url, locals } = event;
  const activeProjectId = locals?.activeProjectId ?? null;
  const selectedProjectId = url.searchParams.get("projectId") || activeProjectId;
  const selectedTaskId = url.searchParams.get("taskId") || null;
  const contextPreviewApi = createContextPreviewApiForEvent(event);

  return {
    activeProjectId,
    selectedProjectId,
    selectedTaskId,
    streamed: {
      options: (async () => {
        return contextPreviewApi.options(selectedProjectId);
      })(),
      bundle: selectedTaskId
        ? (async () => {
            return contextPreviewApi.bundle({ selectedProjectId, selectedTaskId });
          })()
        : null,
    },
  };
};
