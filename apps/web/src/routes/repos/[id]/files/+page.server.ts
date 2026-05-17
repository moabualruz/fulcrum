import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { AppError } from "@platform-core/domain/errors.ts";
import { loadRepositoryFilesPage, type FileTreeNode } from "@integration-hub/interface/repository-files.ts";
import { repositoryRouteContext } from "../../repository-route-context";

export type { FileTreeNode };

export const load: PageServerLoad = ({ params, url, locals }) => {
  const filePath = url.searchParams.get("path") ?? "";
  return {
    activeProjectId: locals?.activeProjectId ?? null,
    filePath,
    streamed: {
      data: (async () => {
        try {
          return await loadRepositoryFilesPage(
            repositoryRouteContext(locals, locals?.activeProjectId ?? null),
            { repoId: params.id, filePath },
          );
        } catch (e) {
          if (e instanceof AppError && e.kind === "not_found") throw error(404, e.message);
          throw e;
        }
      })(),
    },
  };
};
