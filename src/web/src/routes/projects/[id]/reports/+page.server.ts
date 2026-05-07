import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { AppNotFoundError } from "../../../../../../application/errors.ts";
import { loadProjectReportsPage } from "../../../../../../application/reports/queries.ts";
import { requestAppScope } from "$lib/server/application-scope";

export const load: PageServerLoad = async ({ params, url, locals }) => {
  const sprintId = url.searchParams.get("sprint") ?? undefined;
  const { em, ctx } = await requestAppScope(locals, params.id);
  try {
    return await loadProjectReportsPage(em, ctx, { projectId: params.id, sprintId });
  } catch (err) {
    if (err instanceof AppNotFoundError) throw error(404, err.message);
    throw err;
  }
};
