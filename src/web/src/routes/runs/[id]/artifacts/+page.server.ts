import type { PageServerLoad } from "./$types";
import { getEm, getDefaultOrgIdOrm } from "$lib/server/em";
import { listArtifacts } from "../../../../../../../application/artifacts/queries.ts";

export const load: PageServerLoad = ({ params, locals }) => {
  const runId = params.id;

  return {
    runId,
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const em = await getEm();
        const orgId = locals.orgId ?? await getDefaultOrgIdOrm(em);
        const artifacts = (await listArtifacts(em, { orgId, userId: null, projectId: locals?.activeProjectId ?? null }))
          .map((artifact) => ({
            id: artifact.id,
            org_id: artifact.orgId,
            project_id: locals?.activeProjectId ?? null,
            run_id: runId,
            task_id: null,
            kind: "artifact",
            title: artifact.filename,
            body_path: artifact.path,
            sha256: null,
            size: null,
            mime: artifact.mime,
            archived: false,
            created_at: artifact.createdAt.toISOString(),
          }));
        return { artifacts };
      })(),
    },
  };
};
