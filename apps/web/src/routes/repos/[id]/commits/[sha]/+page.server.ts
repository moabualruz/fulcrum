import type { PageServerLoad } from "./$types";
import { error } from "@sveltejs/kit";
import { loadRepositoryCommitDetail } from "@integration-hub/interface/repository-pages.ts";
import { AppError } from "@platform-core/domain/errors.ts";
import { repositoryRouteContext } from "../../../repository-route-context";

export const load: PageServerLoad = ({ params, url, locals }) => ({
  activeProjectId: locals?.activeProjectId ?? null,
  streamed: {
    data: (async () => {
      try {
        return await loadRepositoryCommitDetail(
          repositoryRouteContext(locals, locals?.activeProjectId ?? null),
          {
            repoId: params.id,
            sha: params.sha,
            view: url.searchParams.get("view") === "unified" ? "unified" : "split",
          },
        );
      } catch (e) {
        if (e instanceof AppError && e.kind === "not_found") throw error(404, e.message);
        throw e;
      }
    })(),
  },
});
