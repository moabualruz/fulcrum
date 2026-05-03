import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { listTreeChildren, listIndexedBranches } from "$lib/server/repo-files";

interface RepoRow {
  id: string;
  slug: string;
  root_path: string;
  default_branch: string | null;
}

export const load: PageServerLoad = ({ params, url }) => {
  const branch = url.searchParams.get("branch") ?? undefined;

  return {
    streamed: {
      data: (async () => {
        const db = await openProductDb();
        try {
          const orgId = await getDefaultOrgId(db);
          const repoRows = await db.query<RepoRow>(
            `SELECT id, slug, root_path, default_branch FROM repos WHERE id = $1 AND org_id = $2`,
            [params.id, orgId],
          );
          if (repoRows.length === 0) throw error(404, "Repo not found");
          const repo = repoRows[0]!;

          const activeBranch = branch ?? repo.default_branch ?? "main";
          const branches = await listIndexedBranches(db, repo.id);
          const rootChildren = await listTreeChildren(db, repo.id, activeBranch, null);

          return { repo, branch: activeBranch, branches, rootChildren };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};
