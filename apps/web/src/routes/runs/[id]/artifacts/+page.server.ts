import type { PageServerLoad } from "./$types";
import { requestAppScope } from "$lib/server/application-scope";
import { listArtifacts } from "@/application/artifacts/queries.ts";

export const load: PageServerLoad = ({ params, locals }) => {
  const runId = params.id;

  return {
    runId,
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
        const artifacts = (await listArtifacts(em, ctx))
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
