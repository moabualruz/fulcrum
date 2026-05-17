import type { PageServerLoad } from "./$types";
import { listImporters } from "@integration-hub/interface/project-importers.ts";
import { ensureProjectExists } from "$lib/server/project-api";

export const load: PageServerLoad = async (event) => {
  await ensureProjectExists(event, event.params.id);

  return {
    projectId: event.params.id,
    importers: listImporters(),
  };
};
