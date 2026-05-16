import { redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { listAgentProfilesPageData, testProfile } from "@execution-orchestration/interface/agent-profile-pages.ts";
import { dispatchTaskRun } from "@execution-orchestration/interface/run-actions.ts";
import { createIdleSessionWorkbenchModel } from "@agent-client-protocol/interface/session-workbench.ts";
import { requestServiceScope } from "$lib/server/request-service-scope";
import { actionOk } from "$lib/feedback/action-result";

export const load: PageServerLoad = ({ locals }) => {
  return {
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestServiceScope(locals);
        return {
          ...(await listAgentProfilesPageData(em, ctx)),
          sessionWorkbench: createIdleSessionWorkbenchModel(),
        };
      })(),
    },
  };
};

export const actions: Actions = {
  test: async ({ request, locals }) => {
    const form = await request.formData();
    const name = form.get("name") as string;
    if (!name) return { success: false, message: "Missing profile name" };
    const { em, ctx } = await requestServiceScope(locals);
    const result = await testProfile(em, ctx.orgId, name);
    return actionOk(
      result.test_passed ? `${name}: test passed` : `${name}: test failed`,
    );
  },

  startGuidedPlanning: async ({ request, locals }) => {
    const form = await request.formData();
    const agentName = (form.get("agentName") as string) ?? "";
    const userPrompt = (form.get("userPrompt") as string) ?? "";
    const modeId = (form.get("modeId") as string) || undefined;
    const modelId = (form.get("modelId") as string) || undefined;
    const permissionMode = (form.get("permissionMode") as string) || "review_each_tool";
    const cwd = (form.get("cwd") as string) || process.cwd();
    if (!agentName || !userPrompt)
      return { success: false, message: "agent and prompt are required" };
    const { em, ctx } = await requestServiceScope(locals);
    const { startGuidedAcpPlanningSession } = await import(
      "@planning-review/application/acp-guided-planning-actions.ts"
    );
    const result = await startGuidedAcpPlanningSession(em, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      acpSessionId: `acp-${Date.now()}`,
      agentName,
      cwd,
      userPrompt,
      modeId,
      modelId,
      permissionMode: permissionMode as "review_each_tool" | "allow_workspace" | "read_only",
    });
    return actionOk(`Planning session started (trace: ${result.traceId ?? "none"})`);
  },

  dispatch: async ({ request, locals }) => {
    const form = await request.formData();
    const agent = (form.get("agent") as string | null) ?? "";
    const taskId = (form.get("task_id") as string | null) ?? "";
    const projectId = (form.get("project_id") as string | null) || null;
    if (!agent || !taskId)
      return { success: false, message: "agent and task_id are required" };
    const { em, ctx } = await requestServiceScope(locals, projectId);
    const run = await dispatchTaskRun(em, ctx, { taskId, agent });
    throw redirect(303, `/runs/${run.id}`);
  },
};
