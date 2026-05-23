import { redirect } from "@sveltejs/kit";
import { existsSync, statSync } from "node:fs";
import type { Actions, PageServerLoad } from "./$types";
import { actionOk } from "$lib/feedback/action-result";
import { createAgentsApiForEvent } from "$lib/server/agents-api";

export const load: PageServerLoad = (event) => {
  const { locals } = event;
  return {
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: createAgentsApiForEvent(event).agents.list(),
    },
  };
};

export const actions: Actions = {
  test: async (event) => {
    const form = await event.request.formData();
    const name = form.get("name") as string;
    if (!name) return { success: false, message: "Missing profile name" };
    const result = await createAgentsApiForEvent(event).agents.test({ name }) as { test_passed: boolean };
    return actionOk(
      result.test_passed ? `${name}: test passed` : `${name}: test failed`,
    );
  },

  startGuidedPlanning: async (event) => {
    const form = await event.request.formData();
    const agentName = (form.get("agentName") as string) ?? "";
    const userPrompt = (form.get("userPrompt") as string) ?? "";
    const modeId = (form.get("modeId") as string) || undefined;
    const modelId = (form.get("modelId") as string) || undefined;
    const permissionMode = (form.get("permissionMode") as string) || "review_each_tool";
    const cwd = (form.get("cwd") as string) || process.cwd();
    if (!agentName || !userPrompt)
      return { success: false, message: "agent and prompt are required" };
    const result = await createAgentsApiForEvent(event).agents.startGuidedPlanning({
      acpSessionId: `acp-${Date.now()}`,
      agentName,
      cwd,
      userPrompt,
      modeId,
      modelId,
      permissionMode,
    }) as { traceId?: string | null };
    return actionOk(`Planning session started (trace: ${result.traceId ?? "none"})`);
  },

  dispatch: async (event) => {
    const form = await event.request.formData();
    const agent = (form.get("agent") as string | null) ?? "";
    const taskId = (form.get("task_id") as string | null) ?? "";
    const projectId = (form.get("project_id") as string | null) || null;
    if (!agent || !taskId)
      return { success: false, message: "agent and task_id are required" };
    const run = await createAgentsApiForEvent(event).agents.dispatchTask({ projectId, taskId, agent }) as { id: string };
    throw redirect(303, `/runs/${run.id}`);
  },

  resolvePermission: async (event) => {
    const form = await event.request.formData();
    const sessionId = form.get("sessionId") as string;
    const optionId = form.get("optionId") as string;
    if (!sessionId || !optionId)
      return { success: false, message: "sessionId and optionId required" };
    await createAgentsApiForEvent(event).sessions.resolvePermission({ sessionId, optionId });
    return actionOk("Permission resolved");
  },

  trafficControl: async (event) => {
    const form = await event.request.formData();
    const action = form.get("trafficAction") as string;
    const value = form.get("value") as string;
    if (!action)
      return { success: false, message: "trafficAction required" };
    await createAgentsApiForEvent(event).sessions.updateTraffic({ action, value });
    return actionOk(`Traffic ${action} updated`);
  },

  reconnectSession: async (event) => {
    await createAgentsApiForEvent(event).sessions.reconnect();
    return actionOk("AI Assist reconnected");
  },

  abortWithReason: async (event) => {
    const form = await event.request.formData();
    const reason = (form.get("reason") as string | null) ?? "";
    const note = ((form.get("note") as string | null) ?? "").trim();
    if (!["user-cancel", "dangerous-output", "wrong-context", "cost-cap"].includes(reason)) {
      return { success: false, message: "valid abort reason required" };
    }
    if (!note) return { success: false, message: "abort note required" };
    await createAgentsApiForEvent(event).sessions.abort({ reason, note });
    return actionOk("AI Assist session aborted");
  },

  pauseSession: async (event) => {
    await createAgentsApiForEvent(event).sessions.pause();
    return actionOk("AI Assist paused");
  },

  resumeSession: async (event) => {
    await createAgentsApiForEvent(event).sessions.resume();
    return actionOk("AI Assist resumed");
  },

  restoreCheckpoint: async (event) => {
    const form = await event.request.formData();
    const checkpointId = (form.get("checkpointId") as string | null) ?? "";
    if (!checkpointId) return { success: false, message: "checkpointId required" };
    await createAgentsApiForEvent(event).sessions.restoreCheckpoint({ checkpointId });
    return actionOk("AI Assist restored from checkpoint");
  },

  forkFromCheckpoint: async (event) => {
    const form = await event.request.formData();
    const checkpointId = (form.get("checkpointId") as string | null) ?? "";
    if (!checkpointId) return { success: false, message: "checkpointId required" };
    await createAgentsApiForEvent(event).sessions.forkFromCheckpoint({ checkpointId });
    return actionOk("AI Assist session forked from checkpoint");
  },

  resumeSavedSession: async (event) => {
    const form = await event.request.formData();
    const savedSessionId = form.get("savedSessionId") as string;
    if (!savedSessionId) return { success: false, message: "savedSessionId required" };
    await createAgentsApiForEvent(event).sessions.resumeSaved({ savedSessionId });
    return actionOk("AI Assist session resumed");
  },

  deleteSavedSession: async (event) => {
    const form = await event.request.formData();
    const savedSessionId = form.get("savedSessionId") as string;
    if (!savedSessionId) return { success: false, message: "savedSessionId required" };
    await createAgentsApiForEvent(event).sessions.deleteSaved({ savedSessionId });
    return actionOk("AI Assist session deleted");
  },

  connectBridge: async (event) => {
    const form = await event.request.formData();
    const agentName = form.get("agentName") as string;
    const transportType = form.get("transportType") as string;
    const command = form.get("command") as string;
    const url = form.get("url") as string;
    const modeId = ((form.get("modeId") as string) ?? "").trim();
    const modelId = ((form.get("modelId") as string) ?? "").trim();
    const cwd = ((form.get("cwd") as string) ?? "").trim();
    if (!agentName) return { success: false, message: "agentName required" };
    if (!transportType) return { success: false, message: "transportType required" };
    if (!cwd) return { success: false, message: "working directory required" };
    if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
      return { success: false, message: "working directory must be an existing folder" };
    }
    const session = await createAgentsApiForEvent(event).sessions.connectBridge({
      agentName,
      transportType,
      command,
      url,
      modeId,
      modelId,
      cwd,
    }) as { sessionId: string };
    return actionOk(`Connected to ${agentName} (session: ${session.sessionId})`);
  },
};
