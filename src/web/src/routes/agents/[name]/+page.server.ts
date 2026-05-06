import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { openDatabase, getDefaultOrgId } from "$lib/server/db";
import { getProfile, maskProfile } from "$lib/server/agents";

export const load: PageServerLoad = ({ params, locals }) => {
  return {
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const db = await openDatabase();
        try {
          const orgId = await getDefaultOrgId(db);
          const profile = await getProfile(db, orgId, params.name!);
          if (!profile) throw error(404, "Agent profile not found");

          // Fetch recent runs for this agent
          const runs = await db.query<{
            id: string;
            status: string;
            started_at: string | Date;
            ended_at: string | Date | null;
          }>(
            `SELECT id, status, started_at, ended_at
               FROM agent_runs
              WHERE org_id = $1 AND agent = $2
              ORDER BY started_at DESC
              LIMIT 20`,
            [orgId, params.name!],
          );

          return {
            profile: maskProfile(profile),
            runs: runs.map((r) => ({
              ...r,
              started_at: r.started_at instanceof Date ? r.started_at.toISOString() : r.started_at,
              ended_at: r.ended_at === null ? null : r.ended_at instanceof Date ? r.ended_at.toISOString() : r.ended_at,
            })),
          };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};
