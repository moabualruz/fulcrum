import type { PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { listArtifacts } from "$lib/server/artifacts";

export const load: PageServerLoad = ({ url }) => {
  const kind = (url.searchParams.get("kind") ?? "").trim();
  const project = (url.searchParams.get("project") ?? "").trim();
  const run = (url.searchParams.get("run") ?? "").trim();
  return {
    filter: { kind, project, run },
    streamed: {
      data: (async () => {
        const db = await openProductDb();
        try {
          const orgId = await getDefaultOrgId(db);
          const artifacts = await listArtifacts(db, {
            orgId,
            ...(project ? { projectId: project } : {}),
            ...(run ? { runId: run } : {}),
            ...(kind ? { kind } : {}),
          });
          return { artifacts };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};
