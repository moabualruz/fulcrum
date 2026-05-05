import type { Actions, PageServerLoad } from "./$types";
import { actionOk } from "$lib/feedback/action-result";
import { getRepoDashboard } from "../../../../../repos/dashboard.ts";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

function activeOrgId(locals: App.Locals): string {
  return locals?.orgId ?? locals?.activeOrgId ?? DEFAULT_ORG_ID;
}

export const load: PageServerLoad = ({ locals }) => {
  const activeProjectId = locals?.activeProjectId ?? null;
  const orgId = activeOrgId(locals);

  return {
    activeProjectId,
    streamed: {
      data: (async () => {
        const repos = await getRepoDashboard(orgId);
        return { repos };
      })(),
    },
  };
};

export const actions: Actions = {
  sync: async ({ request, locals }) => {
    const form = await request.formData();
    const repoId = form.get("repo_id")?.toString() ?? "";
    if (!repoId) return actionOk("No repo id");

    const trpcProxy = locals?.trpcProxy;
    if (trpcProxy?.repos?.syncRepo) {
      await trpcProxy.repos.syncRepo.mutate({ repoId });
    }

    return actionOk("Repo sync queued");
  },
};
