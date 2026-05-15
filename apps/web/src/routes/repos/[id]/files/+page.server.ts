import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { requestAppScope } from "$lib/server/application-scope";
import { AppError } from "@platform-core/domain/errors.ts";
import { getRepoFilesPage, type FileTreeNode } from "@integration-hub/application/repo-files/queries.ts";

export type { FileTreeNode };

export const load: PageServerLoad = ({ params, url, locals }) => {
  const filePath = url.searchParams.get("path") ?? "";
  return {
    activeProjectId: locals?.activeProjectId ?? null,
    filePath,
    streamed: {
      data: (async () => {
        try {
          const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
          return await getRepoFilesPage(em, ctx, { repoId: params.id, filePath });
        } catch (e) {
          if (e instanceof AppError && e.kind === "not_found") throw error(404, e.message);
          throw e;
        }
      })(),
    },
  };
};
