import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getAgentProfilePageData } from "@execution-orchestration/interface/agent-profile-pages.ts";
import { requestServiceScope } from "$lib/server/request-service-scope";

export const load: PageServerLoad = ({ params, locals }) => {
  return {
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestServiceScope(locals);
        const data = await getAgentProfilePageData(em, ctx, params.name!);
        if (!data) throw error(404, "Agent profile not found");
        return data;
      })(),
    },
  };
};
