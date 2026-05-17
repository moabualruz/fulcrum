import type { PageServerLoad } from "./$types";
import { activeOrgId, currentUserId, ensureProjectExists } from "$lib/server/project-api";

export const load: PageServerLoad = async (event) => {
  await ensureProjectExists(event, event.params.id);
  return {
    projectId: event.params.id,
    orgId: activeOrgId(event.locals),
    currentUserId: currentUserId(event.locals),
  };
};
