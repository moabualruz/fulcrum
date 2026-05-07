import type { PageServerLoad } from "./$types";
import { listProjectRows } from "@/application/projects/queries.ts";
import { requestAppScope } from "$lib/server/application-scope";

export const load: PageServerLoad = ({ locals }) => {
  const activeProjectId = locals?.activeProjectId ?? null;
  return {
    activeProjectId,
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestAppScope(locals, activeProjectId);
        const projects = await listProjectRows(em, ctx);
        return { projects };
      })(),
    },
  };
};
