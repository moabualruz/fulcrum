import { describe, expect, test } from "bun:test";

import {
  buildSessionWorkbenchModel,
  createIdleSessionWorkbenchModel,
} from "@agent-client-protocol/application/session-workbench.ts";
import { createAcpSessionState } from "@agent-client-protocol/application/session-store.ts";
import { createInMemoryTrafficRecorder } from "@agent-client-protocol/application/traffic.ts";

describe("agent session workbench model", () => {
  test("summarizes connected session state, selectors, messages, tool calls, permissions, and traffic", () => {
    const state = createAcpSessionState({ now: () => 10, createId: () => "generated-id" });
    state.currentSession = {
      id: "row-1",
      agentName: "codex",
      sessionId: "agent-session-1",
      title: "Plan work",
      lastUpdated: 20,
      cwd: "/repo",
      supportsLoadSession: true,
    };
    state.savedSessions = [
      state.currentSession,
      {
        id: "row-2",
        agentName: "codex",
        sessionId: "agent-session-2",
        title: "Older work",
        lastUpdated: 15,
        cwd: "/repo",
        supportsLoadSession: true,
      },
    ];
    state.isConnected = true;
    state.isLoading = true;
    state.availableModes = [
      { id: "planning", name: "Planning" },
      { id: "review", name: "Review" },
    ];
    state.currentModeId = "planning";
    state.availableModels = [
      { modelId: "gpt-5.5", name: "GPT-5.5" },
      { modelId: "gpt-5.4", name: "GPT-5.4" },
    ];
    state.currentModelId = "gpt-5.5";
    state.messages = [
      { id: "m1", role: "user", content: "Build the plan", timestamp: 1 },
      {
        id: "m2",
        role: "assistant",
        content: "Reading context",
        timestamp: 2,
        toolCalls: [{ toolCallId: "tool-1", title: "Read brief", kind: "read", status: "in_progress" }],
      },
    ];
    state.toolCalls.set("tool-1", { toolCallId: "tool-1", title: "Read brief", kind: "read", status: "in_progress" });
    state.pendingPermission = {
      sessionId: "agent-session-1",
      toolCall: { toolCallId: "tool-2", title: "Write file", kind: "write", status: "pending" },
      options: [
        { optionId: "allow_once", kind: "allow", name: "Allow once" },
        { optionId: "deny", kind: "deny", name: "Deny" },
      ],
    };

    const traffic = createInMemoryTrafficRecorder({ now: () => 100, createId: () => "traffic-id" });
    traffic.addEntry({
      direction: "out",
      type: "request",
      method: "session/new",
      requestId: 1,
      payload: { cwd: "/repo" },
    });
    traffic.addEntry({
      direction: "in",
      type: "notification",
      method: "session/update",
      payload: { sessionUpdate: "tool_call" },
    });

    const model = buildSessionWorkbenchModel({ state, traffic });

    expect(model.connection).toEqual({
      status: "connected",
      busy: true,
      error: null,
      startup: { phase: "starting", elapsed: 0, logs: [] },
    });
    expect(model.session).toEqual({
      id: "row-1",
      sessionId: "agent-session-1",
      title: "Plan work",
      agentName: "codex",
      cwd: "/repo",
      lastUpdated: 20,
      supportsResume: true,
    });
    expect(model.controls).toEqual({
      canPrompt: true,
      canCancel: true,
      canDisconnect: true,
      canResolvePermission: true,
      canChangeMode: true,
      canChangeModel: true,
      canResume: true,
    });
    expect(model.modes.map((mode) => [mode.id, mode.selected])).toEqual([
      ["planning", true],
      ["review", false],
    ]);
    expect(model.models.map((model) => [model.modelId, model.selected])).toEqual([
      ["gpt-5.5", true],
      ["gpt-5.4", false],
    ]);
    expect(model.messages).toHaveLength(2);
    expect(model.toolCalls.summary).toEqual({
      total: 1,
      pending: 0,
      inProgress: 1,
      completed: 0,
      failed: 0,
    });
    expect(model.permission?.options.map((option) => option.optionId)).toEqual(["allow_once", "deny"]);
    expect(model.traffic.summary).toEqual({
      total: 2,
      requests: 1,
      responses: 0,
      notifications: 1,
      errors: 0,
    });
    expect(model.resumableSessions.map((session) => session.id)).toEqual(["row-1", "row-2"]);
  });

  test("reports error and disconnected states without enabling session actions", () => {
    const state = createAcpSessionState();
    state.error = "Connection lost";

    const model = buildSessionWorkbenchModel({ state });

    expect(model.connection.status).toBe("error");
    expect(model.session).toBeNull();
    expect(model.controls).toEqual({
      canPrompt: false,
      canCancel: false,
      canDisconnect: false,
      canResolvePermission: false,
      canChangeMode: false,
      canChangeModel: false,
      canResume: false,
    });
  });

  test("builds an idle model for surfaces before a live runtime connects", () => {
    const model = createIdleSessionWorkbenchModel();

    expect(model.connection.status).toBe("idle");
    expect(model.session).toBeNull();
    expect(model.messages).toEqual([]);
    expect(model.traffic.summary.total).toBe(0);
  });
});
