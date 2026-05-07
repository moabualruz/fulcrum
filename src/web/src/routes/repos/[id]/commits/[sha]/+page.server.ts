import type { PageServerLoad } from "./$types";
import { error } from "@sveltejs/kit";
import { requestAppScope } from "$lib/server/application-scope";
import { getRepoCommitDetail } from "../../../../../../../application/repos/queries.ts";
import { AppError } from "../../../../../../../application/errors.ts";

export const load: PageServerLoad = ({ params, url, locals }) => ({
  activeProjectId: locals?.activeProjectId ?? null,
  streamed: {
    data: (async () => {
      try {
        const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
        return await getRepoCommitDetail(em, ctx, {
          repoId: params.id,
          sha: params.sha,
          view: url.searchParams.get("view") === "unified" ? "unified" : "split",
        });
      } catch (e) {
        if (e instanceof AppError && e.kind === "not_found") throw error(404, e.message);
        throw e;
      }
    })(),
  },
});
