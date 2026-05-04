import type { PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { listArtifacts, type ArtifactRow } from "$lib/server/artifacts";
import {
  applyArtifactsFilters,
  type ArtifactsFilterState,
} from "$lib/components/artifacts/artifacts-filters";

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
        const db = await openProductDb();
        try {
          const orgId = await getDefaultOrgId(db);
          const rows = await listArtifacts(db, orgId, filter.showArchived ? { includeArchived: true } : undefined);
          const filtered = applyArtifactsFilters(rows, filter);
          return { artifacts: filtered };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};
