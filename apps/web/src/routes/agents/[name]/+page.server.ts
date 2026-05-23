import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { createAgentsApiForEvent } from "$lib/server/agents-api";

export const load: PageServerLoad = async (event) => {
  const { params, locals } = event;
  let preloaded;
  try {
    preloaded = await createAgentsApiForEvent(event).agents.get({ name: params.name! });
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
