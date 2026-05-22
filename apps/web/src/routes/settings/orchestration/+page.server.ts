import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { createOrchestrationConfigApiForEvent } from "$lib/server/orchestration-config-api";
import { actionOk } from "$lib/feedback/action-result";

export const load: PageServerLoad = (event) => {
  return {
    activeProjectId: event.locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const api = createOrchestrationConfigApiForEvent(event);
        const [config, workflows] = await Promise.all([
          api.orchestration.getConfig(),
          api.workflows.list(),
        ]);
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
  save: async (event) => {
    const form = await event.request.formData();
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

    const api = createOrchestrationConfigApiForEvent(event);
    await api.orchestration.saveConfig({
      pollIntervalS,
      maxConcurrency,
      stallTimeoutS,
      workspaceRoot,
    });
    return actionOk("Orchestration config saved");
  },
};
