import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { loadRepositoryFileDetail } from "@integration-hub/interface/repository-files.ts";
import { AppError } from "@platform-core/domain/errors.ts";
import { requestRepositoryScope } from "../../../repository-request-scope";

export const load: PageServerLoad = ({ params, url, locals }) => {
  const branch = url.searchParams.get("branch") ?? undefined;
  const showBlame = url.searchParams.get("blame") === "1";
  const filePath = params.path!;

  return {
    streamed: {
      data: (async () => {
        try {
          const { em, ctx } = await requestRepositoryScope(locals, locals?.activeProjectId ?? null);
          return await loadRepositoryFileDetail(em, ctx, { repoId: params.id, branch, filePath, showBlame });
        } catch (e) {
          if (e instanceof AppError && e.kind === "not_found") throw error(404, e.message);
          throw e;
        }
      })(),
    },
  };
};
