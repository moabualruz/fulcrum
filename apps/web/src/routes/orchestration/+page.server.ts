import type { Actions, PageServerLoad } from "./$types";
import { requestAppScope } from "$lib/server/application-scope";
import { loadOrchestrationDashboard, listOrchestrationProjectOptions } from "$lib/server/orchestration";
import { cancelRun, dispatchTaskRun, retryRun } from "@execution-orchestration/application/runs/commands.ts";
import { actionOk } from "$lib/feedback/action-result";

export const load: PageServerLoad = ({ url, locals }) => {
  const projectFilter = url.searchParams.get("project") ?? "";

  return {
    activeProjectId: locals?.activeProjectId ?? null,
    projectFilter,
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestAppScope(locals, projectFilter || null);
        const [dashboard, projects] = await Promise.all([
          loadOrchestrationDashboard(em, ctx, projectFilter || undefined),
          listOrchestrationProjectOptions(em, ctx),
        ]);
        return { ...dashboard, projects };
      })(),
    },
  };
};

export const actions: Actions = {
  dispatch: async ({ request, locals }) => {
    const form = await request.formData();
    const taskId = (form.get("task_id") as string | null) ?? "";
    if (!taskId) return { success: false, message: "task_id required" };
    const agent = (form.get("agent") as string | null) ?? "codex";
    try {
      const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
      const result = await dispatchTaskRun(em, ctx, { taskId, agent });
      return actionOk(`Dispatched run ${result.id} (${result.status})`);
    } catch (err) {
      const msg = (err as Error).message ?? "Dispatch failed";
      return { success: false, message: msg };
    }
  },

  cancel: async ({ request, locals }) => {
    const form = await request.formData();
    const id = (form.get("run_id") as string | null) ?? "";
    if (!id) return { success: false, message: "run_id required" };
    const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
    await cancelRun(em, ctx, id);
    return actionOk("Run cancelled");
  },

  retry: async ({ request, locals }) => {
    const form = await request.formData();
    const id = (form.get("run_id") as string | null) ?? "";
    if (!id) return { success: false, message: "run_id required" };
    const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
    await retryRun(em, ctx, id);
    return actionOk("Run queued for retry");
  },
};
