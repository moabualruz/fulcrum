import type { Actions, PageServerLoad } from "./$types";
import { error, fail } from "@sveltejs/kit";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";

interface RepoRow {
  id: string;
  name: string | null;
  slug: string;
  kind: string | null;
  current_branch: string | null;
  last_sync_at: string | Date | null;
  sync_status: string | null;
}

interface CommitRow {
  sha: string;
  message: string | null;
  author: string | null;
  committed_at: string | Date | null;
}

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function subject(message: string | null): string {
  return (message ?? "").split("\n")[0] || "(no subject)";
}

export const load: PageServerLoad = ({ params, locals }) => ({
  activeProjectId: locals?.activeProjectId ?? null,
  streamed: {
    data: (async () => {
      const db = await openProductDb();
      try {
        const orgId = await getDefaultOrgId(db);
        const repos = await db.query<RepoRow>(
          `SELECT id, name, slug, kind, current_branch, last_sync_at, sync_status
             FROM repos
            WHERE org_id = $1 AND id = $2 AND COALESCE(archived, false) = false`,
          [orgId, params.id],
        );
        const row = repos[0];
        if (!row) throw error(404, "repo not found");
        const commits = await db.query<CommitRow>(
          `SELECT sha, message, author, committed_at
             FROM repo_commits
            WHERE org_id = $1 AND repo_id = $2
            ORDER BY committed_at DESC NULLS LAST, sha ASC
            LIMIT 5`,
          [orgId, params.id],
        );
        const taskCounts = await db.query<{ count: string }>(
          `SELECT count(*)::text AS count
             FROM tasks
            WHERE org_id = $1 AND repo_id = $2 AND COALESCE(status, '') NOT IN ('done', 'completed', 'cancelled')`,
          [orgId, params.id],
        );
        const runCounts = await db.query<{ count: string }>(
          `SELECT count(*)::text AS count
             FROM agent_runs
            WHERE org_id = $1 AND started_at >= now() - interval '30 days'`,
          [orgId],
        );
        return {
          repo: {
            id: row.id,
            name: row.name || row.slug,
            slug: row.slug,
            kind: row.kind === "remote" ? "remote" : "local",
            currentBranch: row.current_branch,
            lastSyncAt: iso(row.last_sync_at),
            syncStatus: row.sync_status === "syncing" || row.sync_status === "error" ? row.sync_status : "idle",
            syncError: row.sync_status === "error" ? "Last sync failed. Run sync again for updated details." : null,
          },
          commits: commits.map((commit) => ({
            sha: commit.sha,
            subject: subject(commit.message),
            author: commit.author,
            committedAt: iso(commit.committed_at),
          })),
          openTaskCount: Number(taskCounts[0]?.count ?? 0),
          recentRunCount: Number(runCounts[0]?.count ?? 0),
        };
      } finally {
        await db.close();
      }
    })(),
  },
});

export const actions: Actions = {
  sync: async ({ params }) => {
    const db = await openProductDb();
    try {
      const orgId = await getDefaultOrgId(db);
      await db.query(
        `UPDATE repos SET sync_status = 'syncing', last_touched_at = now() WHERE org_id = $1 AND id = $2`,
        [orgId, params.id],
      );
      return { ok: true };
    } catch (err) {
      return fail(400, { ok: false, message: err instanceof Error ? err.message : "sync failed" });
    } finally {
      await db.close();
    }
  },
};
