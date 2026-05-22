import type { PageServerLoad } from "./$types";
import { listProjectRowsForEvent } from "$lib/server/project-api";

export const load: PageServerLoad = (event) => {
  const { locals } = event;
  const activeProjectId = locals?.activeProjectId ?? null;
  return {
    activeProjectId,
    streamed: {
      data: (async () => {
        const projects = await listProjectRowsForEvent(event);
        return { projects };
      })(),
    },
  };
};
