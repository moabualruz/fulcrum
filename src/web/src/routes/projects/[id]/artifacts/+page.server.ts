import type { PageServerLoad } from "./$types";
import { openDatabase, getDefaultOrgId } from "$lib/server/db";
import { listArtifacts, getArtifactStats, type ArtifactRow, type ArtifactStats } from "$lib/server/artifacts";

export const load: PageServerLoad = ({ params, locals }) => {
  const projectId = params.id;

  return {
    projectId,
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const db = await openDatabase();
        try {
          const orgId = await getDefaultOrgId(db);
          const [artifacts, stats] = await Promise.all([
            listArtifacts(db, orgId, { projectId }),
            getArtifactStats(db, orgId, projectId),
          ]);
          return { artifacts, stats };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};
