import type { PageServerLoad } from "./$types";
import { listArtifactRows } from "../../../../application/artifacts/queries.ts";
import { requestAppScope } from "$lib/server/application-scope";

export const load: PageServerLoad = ({ url, locals }) => {
  const mime = (url.searchParams.get("mime") ?? "").trim();
  const kind = (url.searchParams.get("kind") ?? "").trim();
  const archived = url.searchParams.get("archived") ?? "";
  const projectParam = url.searchParams.get("project");
  const projectRaw = projectParam === null ? undefined : projectParam.trim();

  return {
    activeProjectId: locals?.activeProjectId ?? null,
    filter: { mime, kind, project: projectRaw ?? "", archived },
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
        const artifacts = await listArtifactRows(em, ctx, {
          mime: mime || null,
          kind: kind || null,
          projectId: projectRaw,
          includeArchived: archived === "true",
        });
        return { artifacts };
      })(),
    },
  };
};
