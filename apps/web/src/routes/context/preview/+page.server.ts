import type { PageServerLoad } from "./$types";
import { requestServiceScope } from "$lib/server/request-service-scope";
import { loadContextBundle, loadContextPreviewOptions } from "@knowledge-workspace/interface/context-preview.ts";

export const load: PageServerLoad = ({ url, locals }) => {
  const activeProjectId = locals?.activeProjectId ?? null;
  const selectedProjectId = url.searchParams.get("projectId") || activeProjectId;
  const selectedTaskId = url.searchParams.get("taskId") || null;

  return {
    activeProjectId,
    selectedProjectId,
    selectedTaskId,
    streamed: {
      options: (async () => {
        const { em, ctx } = await requestServiceScope(locals, selectedProjectId);
        return loadContextPreviewOptions(em, ctx, selectedProjectId);
      })(),
      bundle: selectedTaskId
        ? (async () => {
            const { em, ctx } = await requestServiceScope(locals, selectedProjectId);
            return loadContextBundle(em, ctx, { selectedProjectId, selectedTaskId });
          })()
        : null,
    },
  };
};
