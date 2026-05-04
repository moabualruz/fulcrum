import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import {
  getFileByPath,
  getFileContent,
  getBlameForFile,
  listIndexedBranches,
  fileMimeCategory,
  shikiLangFromPath,
} from "$lib/server/repo-files";

interface RepoRow {
  id: string;
  slug: string;
  root_path: string;
  default_branch: string | null;
}

export const load: PageServerLoad = ({ params, url }) => {
  const branch = url.searchParams.get("branch") ?? undefined;
  const showBlame = url.searchParams.get("blame") === "1";
  const filePath = params.path!;

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

          const fileEntry = await getFileByPath(db, repo.id, activeBranch, filePath);
          if (!fileEntry) throw error(404, "File not found");

          const mimeCategory = fileMimeCategory(fileEntry.mime, filePath);
          const lang = shikiLangFromPath(filePath);

          let content: string | null = null;
          let isBinary = false;

          if (mimeCategory !== "binary") {
            const contentRow = await getFileContent(db, repo.id, activeBranch, filePath);
            if (contentRow) {
              content = contentRow.content;
              isBinary = contentRow.is_binary;
            }
          } else {
            isBinary = true;
          }

          let blame: Awaited<ReturnType<typeof getBlameForFile>> = [];
          if (showBlame && !isBinary) {
            blame = await getBlameForFile(db, repo.id, activeBranch, filePath);
          }

          return {
            repo,
            branch: activeBranch,
            branches,
            fileEntry,
            filePath,
            mimeCategory,
            lang,
            content,
            isBinary,
            showBlame,
            blame,
          };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};
