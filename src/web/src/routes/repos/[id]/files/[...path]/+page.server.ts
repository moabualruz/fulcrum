import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { requestAppScope } from "$lib/server/application-scope";
import { getRepoFileDetailPage } from "../../../../../../../application/repo-files/queries.ts";
import { AppError } from "../../../../../../../application/errors.ts";

export const load: PageServerLoad = ({ params, url, locals }) => {
  const branch = url.searchParams.get("branch") ?? undefined;
  const showBlame = url.searchParams.get("blame") === "1";
  const filePath = params.path!;

  return {
    streamed: {
      data: (async () => {
        try {
          const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
          return await getRepoFileDetailPage(em, ctx, { repoId: params.id, branch, filePath, showBlame });
        } catch (e) {
          if (e instanceof AppError && e.kind === "not_found") throw error(404, e.message);
          throw e;
        }
      })(),
    },
  };
};
