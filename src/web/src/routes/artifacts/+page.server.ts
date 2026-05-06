import type { PageServerLoad } from "./$types";
import { listArtifacts } from "../../../../application/artifacts/queries.ts";
import {
  applyArtifactsFilters,
  type ArtifactsFilterState,
} from "$lib/components/artifacts/artifacts-filters";
import { getEm, getDefaultOrgIdOrm } from "$lib/server/em";

export const load: PageServerLoad = ({ url, locals }) => {
  const mime = (url.searchParams.get("mime") ?? "").trim();
  const kind = (url.searchParams.get("kind") ?? "").trim();
  const archived = url.searchParams.get("archived") ?? "";
  const projectParam = url.searchParams.get("project");
  const projectRaw = projectParam === null ? undefined : projectParam.trim();

  const filter: ArtifactsFilterState = {
    ...(mime ? { mime } : {}),
    ...(kind ? { kind } : {}),
    ...(projectRaw !== undefined ? { projectId: projectRaw } : {}),
    ...(archived === "true" ? { showArchived: true } : {}),
  };

  return {
    activeProjectId: locals?.activeProjectId ?? null,
    filter: { mime, kind, project: projectRaw ?? "", archived },
    streamed: {
      data: (async () => {
        const em = locals.em ?? await getEm();
        const orgId = locals.orgId ?? await getDefaultOrgIdOrm(em);
        const rows = await listArtifacts(em, { orgId, userId: null, projectId: locals?.activeProjectId ?? null });
        const artifacts = rows.map((row) => ({
          id: row.id,
          org_id: row.orgId,
          project_id: null,
          run_id: null,
          task_id: null,
          kind: "file",
          title: row.filename,
          body_path: row.path,
          sha256: null,
          size: null,
          mime: row.mime,
          created_at: row.createdAt.toISOString(),
          archived: false,
        }));
        const filtered = applyArtifactsFilters(artifacts, filter);
        return { artifacts: filtered };
      })(),
    },
  };
};
