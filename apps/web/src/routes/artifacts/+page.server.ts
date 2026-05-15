import type { PageServerLoad } from "./$types";
import { createArtifactApiForEvent, type PublicArtifact, toArtifactRow } from "$lib/server/artifact-api";

export const load: PageServerLoad = (event) => {
  const { url, locals } = event;
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
        const artifacts = await createArtifactApiForEvent(event).artifacts.list({
          mime: mime || null,
          kind: kind || null,
          projectId: projectRaw,
          archived: archived === "true" ? undefined : false,
        }) as PublicArtifact[];
        return { artifacts: artifacts.map(toArtifactRow) };
      })(),
    },
  };
};
