import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requestServiceScope } from "$lib/server/request-service-scope";
import {
  loadOrchestrationConfig,
  listWorkflowDefs,
  upsertOrchestrationConfig,
} from "$lib/server/orchestration";
import { actionOk } from "$lib/feedback/action-result";

export const load: PageServerLoad = ({ locals }) => {
  return {
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestServiceScope(locals, locals?.activeProjectId ?? null);
        const config = await loadOrchestrationConfig(em, ctx);
        const workflows = await listWorkflowDefs(em, ctx);
        return {
          config: config ?? {
            poll_interval_s: 5,
            max_concurrency: 4,
            stall_timeout_s: 300,
            workspace_root: null,
          },
          workflows,
        };
      })(),
    },
  };
};

export const actions: Actions = {
  save: async ({ request, locals }) => {
    const form = await request.formData();
    const pollIntervalS = Number(form.get("poll_interval_s") ?? 5);
    const maxConcurrency = Number(form.get("max_concurrency") ?? 4);
    const stallTimeoutS = Number(form.get("stall_timeout_s") ?? 300);
    const workspaceRoot = (form.get("workspace_root") as string)?.trim() || null;

    if (pollIntervalS < 1 || pollIntervalS > 3600)
      return fail(400, { error: "Poll interval must be 1-3600s" });
    if (maxConcurrency < 1 || maxConcurrency > 64)
      return fail(400, { error: "Max concurrency must be 1-64" });
    if (stallTimeoutS < 10 || stallTimeoutS > 86400)
      return fail(400, { error: "Stall timeout must be 10-86400s" });

    const { em, ctx } = await requestServiceScope(locals, locals?.activeProjectId ?? null);
    await upsertOrchestrationConfig(em, ctx, {
      pollIntervalS,
      maxConcurrency,
      stallTimeoutS,
      workspaceRoot,
    });
    return actionOk("Orchestration config saved");
  },
};
