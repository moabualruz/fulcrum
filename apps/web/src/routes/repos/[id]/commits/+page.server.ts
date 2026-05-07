import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { requestAppScope } from "$lib/server/application-scope";
import { getRepoCommitsPage } from "@/application/repos/queries.ts";
import { AppError } from "@/application/errors.ts";

export const _PAGE_SIZE = 50;

interface CommitEntry {
  sha: string;
  shortSha: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

export const load: PageServerLoad = ({ params, url, locals }) => {
  const pageParam = parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
  const skip = (page - 1) * _PAGE_SIZE;

  return {
    activeProjectId: locals?.activeProjectId ?? null,
    page,
    streamed: {
      data: (async () => {
        try {
          const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
          return await getRepoCommitsPage(em, ctx, { repoId: params.id, page, pageSize: _PAGE_SIZE });
        } catch (e) {
          if (e instanceof AppError && e.kind === "not_found") throw error(404, e.message);
          throw e;
        }
      })(),
    },
  };
};
