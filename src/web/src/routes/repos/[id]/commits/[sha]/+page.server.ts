import type { PageServerLoad } from "./$types";
import { error } from "@sveltejs/kit";
import { openDatabase, getDefaultOrgId } from "$lib/server/db";

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
  diff?: string | null;
}

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function subject(message: string | null): string {
  return (message ?? "").split("\n")[0] || "(no subject)";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function diffStats(diff: string) {
  const files = new Set<string>();
  let insertions = 0;
  let deletions = 0;
  for (const line of diff.split("\n")) {
    const file = /^diff --git a\/(.+?) b\//.exec(line);
    if (file?.[1]) files.add(file[1]);
    if (line.startsWith("+") && !line.startsWith("+++")) insertions += 1;
    if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
  }
  return { filesChanged: files.size, insertions, deletions };
}

function renderDiffHtml(diff: string, view: string): string {
  const rows = diff.split("\n").map((line) => {
    const cls = line.startsWith("+") ? "ins" : line.startsWith("-") ? "del" : "ctx";
    return `<div data-shiki-line class="d2h-code-line ${cls}"><code>${escapeHtml(line)}</code></div>`;
  }).join("");
  return `<div data-diff2html data-view="${escapeHtml(view)}">${rows}</div>`;
}

export const load: PageServerLoad = ({ params, url, locals }) => ({
  activeProjectId: locals?.activeProjectId ?? null,
  streamed: {
    data: (async () => {
      const db = await openDatabase();
      try {
        const orgId = await getDefaultOrgId(db);
        const repos = await db.query<RepoRow>(
          `SELECT id, name, slug FROM repos
            WHERE org_id = $1 AND id = $2 AND COALESCE(archived, false) = false`,
          [orgId, params.id],
        );
        const repo = repos[0];
        if (!repo) throw error(404, "repo not found");
        const commits = await db.query<CommitRow>(
          `SELECT sha, message, author, committed_at, diff
             FROM repo_commits
            WHERE org_id = $1 AND repo_id = $2 AND sha = $3
            LIMIT 1`,
          [orgId, params.id, params.sha],
        );
        const commit = commits[0];
        if (!commit) throw error(404, "commit not found");
        const raw = commit.diff ?? "";
        return {
          repo: { id: repo.id, name: repo.name || repo.slug, slug: repo.slug },
          commit: {
            sha: commit.sha,
            subject: subject(commit.message),
            author: commit.author,
            committedAt: iso(commit.committed_at),
          },
          diff: {
            raw,
            html: renderDiffHtml(raw, url.searchParams.get("view") === "unified" ? "unified" : "split"),
            ...diffStats(raw),
          },
        };
      } finally {
        await db.close();
      }
    })(),
  },
});
