import type { Actions, PageServerLoad } from "./$types";
import { actionOk } from "$lib/feedback/action-result";
import { requestAppScope } from "$lib/server/application-scope";
import { touchRepoSync } from "../../../../application/repos/commands.ts";
import { listRepoPageRows } from "../../../../application/repos/queries.ts";

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
  sync: async ({ request, locals }) => {
    const form = await request.formData();
    const repoId = form.get("repo_id")?.toString() ?? "";
    if (!repoId) return actionOk("No repo id");

    const trpcProxy = locals?.trpcProxy;
    if (trpcProxy?.repos?.syncRepo) {
      await trpcProxy.repos.syncRepo.mutate({ repoId });
    } else {
      const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
      await touchRepoSync(em, ctx, repoId);
    }

    return actionOk("Repo sync queued");
  },
};
