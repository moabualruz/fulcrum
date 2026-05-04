import type { PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { listArtifacts, type ArtifactRow } from "$lib/server/artifacts";

export const load: PageServerLoad = ({ params, locals }) => {
  const runId = params.id;

  return {
    runId,
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const db = await openProductDb();
        try {
          const orgId = await getDefaultOrgId(db);
          const artifacts = await listArtifacts(db, orgId, { runId });
          return { artifacts };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};
