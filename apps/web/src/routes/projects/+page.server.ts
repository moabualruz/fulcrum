import type { PageServerLoad } from "./$types";
import { listProjectRows } from "@work-management/interface/project-lifecycle.ts";
import { requestServiceScope } from "$lib/server/request-service-scope";

export const load: PageServerLoad = ({ locals }) => {
  const activeProjectId = locals?.activeProjectId ?? null;
  return {
    activeProjectId,
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestServiceScope(locals, activeProjectId);
        const projects = await listProjectRows(em, ctx);
        return { projects };
      })(),
    },
  };
};
