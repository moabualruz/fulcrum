import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getProjectOrNull } from "@/application/projects/queries.ts";
import { requestAppScope } from "$lib/server/application-scope";

export const load: PageServerLoad = async ({ params, locals }) => {
  const { em, ctx } = await requestAppScope(locals, params.id);
  const project = await getProjectOrNull(em, ctx, params.id);
  if (!project) throw error(404, "Project not found");
  return { projectId: params.id };
};
