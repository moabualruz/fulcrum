import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getAgentProfilePageData } from "@execution-orchestration/interface/agent-profile-pages.ts";
import { requestServiceScope } from "$lib/server/request-service-scope";

export const load: PageServerLoad = async ({ params, locals }) => {
  const { em, ctx } = await requestServiceScope(locals);
  let preloaded;
  try {
    preloaded = await getAgentProfilePageData(em, ctx, params.name!);
  } catch {
    throw error(404, "Agent profile not found");
  }
  if (!preloaded) throw error(404, "Agent profile not found");
  return {
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: Promise.resolve(preloaded),
    },
  };
};
