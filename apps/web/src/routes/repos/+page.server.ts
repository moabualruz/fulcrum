import type { Actions, PageServerLoad } from "./$types";
import { actionOk } from "$lib/feedback/action-result";
import { listRepositoryPageRows } from "@integration-hub/interface/repository-pages.ts";
import { repositoryRouteContext } from "./repository-route-context";
import { queueRepositorySync } from "./repository-sync-api";

export const load: PageServerLoad = ({ locals }) => {
  const activeProjectId = locals?.activeProjectId ?? null;

  return {
    activeProjectId,
    streamed: {
      data: (async () => {
        return { repos: await listRepositoryPageRows(repositoryRouteContext(locals, activeProjectId)) };
      })(),
    },
  };
};

export const actions: Actions = {
  sync: async (event) => {
    const form = await event.request.formData();
    const repoId = form.get("repo_id")?.toString() ?? "";
    if (!repoId) return actionOk("No repo id");

    await queueRepositorySync(event, repoId);
    return actionOk("Repo sync queued");
  },
};
