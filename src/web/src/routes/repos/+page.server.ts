import type { PageServerLoad, Actions } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { actionOk } from "$lib/feedback/action-result";

export interface RepoRow {
  id: string;
  slug: string;
  root_path: string;
  default_branch: string | null;
  remote_url: string | null;
  registered_at: string;
  last_seen_at: string;
  project_id: string | null;
}

function isoStamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

export const load: PageServerLoad = ({ locals }) => {
  const activeProjectId = locals?.activeProjectId ?? null;
  return {
    activeProjectId,
    streamed: {
      data: (async () => {
        const db = await openProductDb();
        try {
          const orgId = await getDefaultOrgId(db);
          const rows = await db.query<{
            id: string;
            slug: string;
            root_path: string;
            default_branch: string | null;
            remote_url: string | null;
            registered_at: string | Date;
            last_seen_at: string | Date;
            project_id: string | null;
          }>(
            `SELECT id, slug, root_path, default_branch, remote_url,
                    registered_at, last_seen_at, project_id
               FROM repos
              WHERE org_id = $1
              ORDER BY registered_at ASC, id ASC`,
            [orgId],
          );
          const repos: RepoRow[] = rows.map((r) => ({
            ...r,
            registered_at: isoStamp(r.registered_at),
            last_seen_at: isoStamp(r.last_seen_at),
          }));
          return { repos };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};

export const actions: Actions = {
  sync: async ({ request }) => {
    const form = await request.formData();
    const repoId = form.get("repo_id")?.toString() ?? "";
    if (!repoId) return actionOk("No repo id");
    const db = await openProductDb();
    try {
      const now = new Date().toISOString();
      await db.query(
        `UPDATE repos SET last_seen_at = $1 WHERE id = $2`,
        [now, repoId],
      );
    } finally {
      await db.close();
    }
    return actionOk("Repo synced");
  },
};
