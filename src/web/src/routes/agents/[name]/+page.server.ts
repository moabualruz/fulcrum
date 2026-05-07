import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getAgentProfilePageData } from "../../../../../application/agents/queries.ts";
import { requestAppScope } from "$lib/server/application-scope";

export const load: PageServerLoad = ({ params, locals }) => {
  return {
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestAppScope(locals);
        const data = await getAgentProfilePageData(em, ctx, params.name!);
        if (!data) throw error(404, "Agent profile not found");
        return data;
      })(),
    },
  };
};
