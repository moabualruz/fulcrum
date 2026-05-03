import type { PageServerLoad } from "./$types";
import { error } from "@sveltejs/kit";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";

const PAGE_SIZE = 20;

interface RepoRow {
  id: string;
  name: string | null;
  slug: string;
}

interface CommitRow {
  sha: string;
  message: string | null;
  author: string | null;
  committed_at: string | Date | null;
  parents?: string[] | null;
}

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function subject(message: string | null): string {
  return (message ?? "").split("\n")[0] || "(no subject)";
}

function authorName(author: string | null): string {
  return (author ?? "unknown").replace(/\s*<[^>]+>\s*$/, "") || "unknown";
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts.at(-1)![0] ?? ""}`.toUpperCase();
}

export const load: PageServerLoad = ({ params, url, locals }) => ({
  activeProjectId: locals?.activeProjectId ?? null,
  streamed: {
    data: (async () => {
      const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
      const db = await openProductDb();
      try {
        const orgId = await getDefaultOrgId(db);
        const repos = await db.query<RepoRow>(
          `SELECT id, name, slug FROM repos
            WHERE org_id = $1 AND id = $2 AND COALESCE(archived, false) = false`,
          [orgId, params.id],
        );
        const repo = repos[0];
        if (!repo) throw error(404, "repo not found");
        const rows = await db.query<CommitRow>(
          `SELECT sha, message, author, committed_at, parents
             FROM repo_commits
            WHERE org_id = $1 AND repo_id = $2
            ORDER BY committed_at DESC NULLS LAST, sha ASC
            LIMIT $3 OFFSET $4`,
          [orgId, params.id, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE],
        );
        const commits = rows.slice(0, PAGE_SIZE).map((commit) => {
          const name = authorName(commit.author);
          return {
            sha: commit.sha,
            subject: subject(commit.message),
            authorName: name,
            authorRaw: commit.author,
            avatarInitials: initials(name),
            committedAt: iso(commit.committed_at),
            parents: commit.parents ?? [],
          };
        });
        return {
          repo: { id: repo.id, name: repo.name || repo.slug, slug: repo.slug },
          page,
          pageSize: PAGE_SIZE,
          hasMore: rows.length > PAGE_SIZE,
          commits,
        };
      } finally {
        await db.close();
      }
    })(),
  },
});
