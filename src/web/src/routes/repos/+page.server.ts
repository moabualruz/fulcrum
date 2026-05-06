import type { Actions, PageServerLoad } from "./$types";
import { actionOk } from "$lib/feedback/action-result";
import { getDefaultOrgId, openDatabase, type WebDatabaseHandle } from "$lib/server/db";

type RepoRow = {
  id: string;
  slug: string;
  root_path?: string | null;
  default_branch?: string | null;
  remote_url?: string | null;
  registered_at?: string | Date;
  last_seen_at?: string | Date;
  project_id?: string | null;
  path?: string | null;
  remoteUrl?: string | null;
  branch?: string | null;
  dirty?: boolean;
  lastSyncAt?: string | Date | null;
  recentCommit?: string | null;
  openTaskCount?: number;
  health?: string;
  watcherStatus?: string;
  syncLatencyMs?: number | null;
  lastSyncError?: string | null;
};

function isoStamp(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function isMissingColumn(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "42703"
  );
}

async function listRepos(db: WebDatabaseHandle, orgId: string): Promise<RepoRow[]> {
  try {
    const rows = await db.query<RepoRow>(
      `SELECT r.id, r.slug, r.root_path, r.default_branch, r.remote_url,
              r.registered_at, r.last_seen_at, r.project_id,
              COALESCE(r.local_path, r.root_path, r.remote_url, r.name, r.slug) AS path,
              r.remote_url AS "remoteUrl",
              COALESCE(r.current_branch, r.default_branch) AS branch,
              false AS dirty,
              COALESCE(r.last_sync_at, r.last_seen_at) AS "lastSyncAt",
              NULL::text AS "recentCommit",
              COALESCE((
                SELECT count(*)::int FROM tasks t
                 WHERE t.org_id = r.org_id AND t.repo_id = r.id
                   AND t.status NOT IN ('completed', 'cancelled')
              ), 0) AS "openTaskCount",
              CASE WHEN r.sync_status IN ('error', 'failed') THEN 'failed'
                   WHEN COALESCE(r.last_sync_at, r.last_seen_at) IS NULL THEN 'stale'
                   ELSE 'healthy'
              END AS health,
              'unknown' AS "watcherStatus",
              NULL::int AS "syncLatencyMs",
              NULL::text AS "lastSyncError"
         FROM repos r
        WHERE r.org_id = $1 AND COALESCE(r.archived, false) = false
        ORDER BY r.registered_at ASC, r.id ASC`,
      [orgId],
    );
    return rows.map((row) => ({
      ...row,
      registered_at: isoStamp(row.registered_at) ?? "",
      last_seen_at: isoStamp(row.last_seen_at) ?? "",
      lastSyncAt: isoStamp(row.lastSyncAt),
    }));
  } catch (error) {
    if (!isMissingColumn(error)) throw error;
  }

  const rows = await db.query<RepoRow>(
    `SELECT r.id, r.slug,
            COALESCE(r.local_path, r.remote_url, r.name) AS path,
            r.remote_url AS "remoteUrl",
            r.current_branch AS branch,
            false AS dirty,
            r.last_sync_at AS "lastSyncAt",
            NULL::text AS "recentCommit",
            0 AS "openTaskCount",
            CASE WHEN r.sync_status IN ('error', 'failed') THEN 'failed'
                 WHEN r.last_sync_at IS NULL THEN 'stale'
                 ELSE 'healthy'
            END AS health,
            'unknown' AS "watcherStatus",
            NULL::int AS "syncLatencyMs",
            NULL::text AS "lastSyncError"
       FROM repos r
      WHERE r.org_id = $1 AND COALESCE(r.archived, false) = false
      ORDER BY COALESCE(r.last_touched_at, r.last_sync_at) DESC NULLS LAST, r.id ASC`,
    [orgId],
  );
  return rows.map((row) => ({ ...row, lastSyncAt: isoStamp(row.lastSyncAt) }));
}

async function touchRepo(db: WebDatabaseHandle, repoId: string): Promise<void> {
  try {
    await db.query(`UPDATE repos SET last_seen_at = now() WHERE id = $1`, [repoId]);
  } catch (error) {
    if (!isMissingColumn(error)) throw error;
    await db.query(`UPDATE repos SET last_sync_at = now(), last_touched_at = now() WHERE id = $1`, [repoId]);
  }
}

export const load: PageServerLoad = ({ locals }) => {
  const activeProjectId = locals?.activeProjectId ?? null;

  return {
    activeProjectId,
    streamed: {
      data: (async () => {
        const db = await openDatabase();
        try {
          const orgId = locals?.orgId ?? await getDefaultOrgId(db);
          const repos = await listRepos(db, orgId);
          return { repos };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};

export const actions: Actions = {
  sync: async ({ request, locals }) => {
    const form = await request.formData();
    const repoId = form.get("repo_id")?.toString() ?? "";
    if (!repoId) return actionOk("No repo id");

    const trpcProxy = locals?.trpcProxy;
    if (trpcProxy?.repos?.syncRepo) {
      await trpcProxy.repos.syncRepo.mutate({ repoId });
    } else {
      const db = await openDatabase();
      try {
        await touchRepo(db, repoId);
      } finally {
        await db.close();
      }
    }

    return actionOk("Repo sync queued");
  },
};
