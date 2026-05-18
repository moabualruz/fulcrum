import { redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { listAgentProfilesPageData, testProfile } from "@execution-orchestration/interface/agent-profile-pages.ts";
import { dispatchTaskRun } from "@execution-orchestration/interface/run-actions.ts";
import { createIdleSessionWorkbenchModel, getActiveSessionManager } from "@agent-client-protocol/interface/session-workbench.ts";
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
          sessionWorkbench: getActiveSessionManager()?.getWorkbenchModel() ?? createIdleSessionWorkbenchModel(),
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

  resolvePermission: async ({ request, locals }) => {
    const form = await request.formData();
    const sessionId = form.get("sessionId") as string;
    const optionId = form.get("optionId") as string;
    if (!sessionId || !optionId)
      return { success: false, message: "sessionId and optionId required" };
    const { em, ctx } = await requestServiceScope(locals);
    const { resolveSessionPermission } = await import(
      "@agent-client-protocol/application/session-manager.ts"
    );
    await resolveSessionPermission(em, { sessionId, optionId });
    return actionOk("Permission resolved");
  },

  trafficControl: async ({ request, locals }) => {
    const form = await request.formData();
    const action = form.get("trafficAction") as string;
    const value = form.get("value") as string;
    if (!action)
      return { success: false, message: "trafficAction required" };
    const { em, ctx } = await requestServiceScope(locals);
    const { updateTrafficControl } = await import(
      "@agent-client-protocol/application/session-manager.ts"
    );
    await updateTrafficControl(em, { action, value });
    return actionOk(`Traffic ${action} updated`);
  },

  reconnectSession: async ({ locals }) => {
    const { em } = await requestServiceScope(locals);
    const { reconnectActiveSession } = await import(
      "@agent-client-protocol/application/session-manager.ts"
    );
    await reconnectActiveSession(em);
    return actionOk("AI Assist reconnected");
  },

  abortSession: async ({ locals }) => {
    const { em } = await requestServiceScope(locals);
    const { abortActiveSession } = await import(
      "@agent-client-protocol/application/session-manager.ts"
    );
    await abortActiveSession(em);
    return actionOk("AI Assist session aborted");
  },

  pauseSession: async ({ locals }) => {
    const { em } = await requestServiceScope(locals);
    const { pauseActiveSession } = await import(
      "@agent-client-protocol/application/session-manager.ts"
    );
    await pauseActiveSession(em);
    return actionOk("AI Assist paused");
  },

  resumeSession: async ({ locals }) => {
    const { em } = await requestServiceScope(locals);
    const { resumeActiveSession } = await import(
      "@agent-client-protocol/application/session-manager.ts"
    );
    await resumeActiveSession(em);
    return actionOk("AI Assist resumed");
  },

  resumeSavedSession: async ({ request, locals }) => {
    const form = await request.formData();
    const savedSessionId = form.get("savedSessionId") as string;
    if (!savedSessionId) return { success: false, message: "savedSessionId required" };
    const { em } = await requestServiceScope(locals);
    const { resumeSavedSession } = await import(
      "@agent-client-protocol/application/session-manager.ts"
    );
    await resumeSavedSession(em, { savedSessionId });
    return actionOk("AI Assist session resumed");
  },

  deleteSavedSession: async ({ request, locals }) => {
    const form = await request.formData();
    const savedSessionId = form.get("savedSessionId") as string;
    if (!savedSessionId) return { success: false, message: "savedSessionId required" };
    const { em } = await requestServiceScope(locals);
    const { deleteSavedSession } = await import(
      "@agent-client-protocol/application/session-manager.ts"
    );
    await deleteSavedSession(em, { savedSessionId });
    return actionOk("AI Assist session deleted");
  },

  connectBridge: async ({ request, locals }) => {
    const form = await request.formData();
    const agentName = form.get("agentName") as string;
    const transportType = form.get("transportType") as string;
    const command = form.get("command") as string;
    const url = form.get("url") as string;
    const cwd = (form.get("cwd") as string) || process.cwd();
    if (!agentName) return { success: false, message: "agentName required" };
    if (!transportType) return { success: false, message: "transportType required" };
    const { AcpSessionManager, setActiveSessionManager } = await import(
      "@agent-client-protocol/interface/session-workbench.ts"
    );
    const { createAcpClientBridge } = await import(
      "@agent-client-protocol/application/client-bridge-factory.ts"
    );
    const { createAcpSessionState } = await import(
      "@agent-client-protocol/application/session-store.ts"
    );
    const { createAcpConfigState } = await import(
      "@agent-client-protocol/application/config-store.ts"
    );
    let agentConfig: Record<string, unknown>;
    if (transportType === "stdio" && command) {
      agentConfig = { type: "stdio", command, args: [], env: {} };
    } else if (transportType === "websocket" && url) {
      agentConfig = { type: "remote", transport: "websocket", url, headers: {} };
    } else {
      return { success: false, message: "invalid transport config" };
    }
    const config = createAcpConfigState({ config: { agents: { [agentName]: agentConfig } } });
    const manager = new AcpSessionManager({
      state: createAcpSessionState(),
      config,
      createBridge: async (input) => createAcpClientBridge({ config: config.getAgent(input.name)!, cwd }),
    });
    setActiveSessionManager(manager);
    const session = await manager.createSession(agentName, cwd);
    return actionOk(`Connected to ${agentName} (session: ${session.sessionId})`);
  },
};
