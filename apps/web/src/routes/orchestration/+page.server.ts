import type { Actions, PageServerLoad } from "./$types";
import { createOrchestrationConfigApiForEvent } from "$lib/server/orchestration-config-api";
import { actionOk } from "$lib/feedback/action-result";

export const load: PageServerLoad = (event) => {
  const projectFilter = event.url.searchParams.get("project") ?? "";

  return {
    activeProjectId: event.locals?.activeProjectId ?? null,
    projectFilter,
    streamed: {
      data: (async () => {
        const api = createOrchestrationConfigApiForEvent(event);
        const [dashboard, projects] = await Promise.all([
          api.orchestration.dashboard({ projectId: projectFilter || undefined }),
          api.orchestration.projects(),
        ]);
        return { ...(dashboard as Record<string, unknown>), projects };
      })(),
    },
  };
};

export const actions: Actions = {
  dispatch: async (event) => {
    const form = await event.request.formData();
    const taskId = (form.get("task_id") as string | null) ?? "";
    if (!taskId) return { success: false, message: "task_id required" };
    const agent = (form.get("agent") as string | null) ?? "codex";
    try {
      const api = createOrchestrationConfigApiForEvent(event);
      const result = await api.runs.dispatch({ taskId, agent, projectId: event.locals?.activeProjectId ?? undefined }) as {
        id?: string;
        status?: string;
      };
      return actionOk(`Dispatched run ${result.id ?? "queued"} (${result.status ?? "pending"})`);
    } catch (err) {
      const msg = (err as Error).message ?? "Dispatch failed";
      return { success: false, message: msg };
    }
  },

  cancel: async (event) => {
    const form = await event.request.formData();
    const id = (form.get("run_id") as string | null) ?? "";
    if (!id) return { success: false, message: "run_id required" };
    const api = createOrchestrationConfigApiForEvent(event);
    await api.runs.cancel({ id });
    return actionOk("Run cancelled");
  },

  retry: async (event) => {
    const form = await event.request.formData();
    const id = (form.get("run_id") as string | null) ?? "";
    if (!id) return { success: false, message: "run_id required" };
    const api = createOrchestrationConfigApiForEvent(event);
    await api.runs.retry({ id });
    return actionOk("Run queued for retry");
  },
};
