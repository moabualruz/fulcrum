import type { Actions, PageServerLoad } from "./$types";
import { actionOk } from "$lib/feedback/action-result";
import { requestAppScope } from "$lib/server/application-scope";
import { listRepoPageRows } from "@integration-hub/application/repos/queries.ts";
import { queueRepositorySync } from "./repository-sync-api";

export const load: PageServerLoad = ({ locals }) => {
  const activeProjectId = locals?.activeProjectId ?? null;

  return {
    activeProjectId,
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestAppScope(locals, activeProjectId);
        return { repos: await listRepoPageRows(em, ctx) };
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
