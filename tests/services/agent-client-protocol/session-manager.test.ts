import { describe, expect, test } from "bun:test";

import { createAcpConfigState } from "@agent-client-protocol/application/config-store.ts";
import {
  AcpSessionManager,
  type AcpBridgeClient,
  type CreateAcpBridgeInput,
} from "@agent-client-protocol/application/session-manager.ts";
import { createAcpSessionState } from "@agent-client-protocol/application/session-store.ts";
import type {
  AgentsConfig,
  AuthenticateRequest,
  AuthenticateResponse,
  CancelNotification,
  InitializeRequest,
  InitializeResponse,
  LoadSessionRequest,
  LoadSessionResponse,
  NewSessionRequest,
  NewSessionResponse,
  PermissionRequest,
  PromptRequest,
  PromptResponse,
  SessionNotification,
} from "@agent-client-protocol/domain/protocol.ts";

class FakeBridge implements AcpBridgeClient {
  initializeCalls: InitializeRequest[] = [];
  newSessionCalls: NewSessionRequest[] = [];
  loadSessionCalls: LoadSessionRequest[] = [];
  promptCalls: PromptRequest[] = [];
  cancelCalls: CancelNotification[] = [];
  setModeCalls: { sessionId: string; modeId: string }[] = [];
  setModelCalls: { sessionId: string; modelId: string }[] = [];
  disconnectCalls = 0;
  resolvePermissionCalls: string[] = [];
  cancelPermissionCalls = 0;
  onSessionUpdate: ((notification: SessionNotification) => void) | null = null;
  onTransportClose: ((reason?: string) => void) | null = null;
  onPermissionRequest: ((request: PermissionRequest) => void) | null = null;
  onPermissionSettled: (() => void) | null = null;
  pendingPermissionRequest: PermissionRequest | null = null;

  constructor(
    private readonly initializeResponse: InitializeResponse,
    private readonly newSessionResponse: NewSessionResponse,
    public loadSessionResponse: LoadSessionResponse = { sessionId: "agent-session-1" },
  ) {}

  async initialize(params: InitializeRequest): Promise<InitializeResponse> {
    this.initializeCalls.push(params);
    return this.initializeResponse;
  }

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    this.newSessionCalls.push(params);
    return this.newSessionResponse;
  }

  async loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    this.loadSessionCalls.push(params);
    return this.loadSessionResponse;
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    this.promptCalls.push(params);
    return { stopReason: "end_turn" };
  }

  async cancel(params: CancelNotification): Promise<void> {
    this.cancelCalls.push(params);
  }

  async setMode(params: { sessionId: string; modeId: string }): Promise<void> {
    this.setModeCalls.push(params);
  }

  async unstable_setSessionModel(params: { sessionId: string; modelId: string }): Promise<void> {
    this.setModelCalls.push(params);
  }

  async authenticate(_params: AuthenticateRequest): Promise<AuthenticateResponse> {
    return {};
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls += 1;
  }

  resolvePermission(optionId: string): void {
    this.resolvePermissionCalls.push(optionId);
    this.pendingPermissionRequest = null;
    this.onPermissionSettled?.();
  }

  cancelPermission(): void {
    this.cancelPermissionCalls += 1;
    this.pendingPermissionRequest = null;
    this.onPermissionSettled?.();
  }
}

const config: AgentsConfig = {
  agents: {
    codex: { command: "codex", args: ["--json"] },
  },
};

describe("ACP ported session manager", () => {
  test("creates an ACP session through a bridge factory and stores modes/models/load capability", async () => {
    const state = createAcpSessionState({ createId: () => "session-row-1", now: () => 1_700_000_000_000 });
    const configState = createAcpConfigState({ config });
    const bridge = new FakeBridge(
      { agentCapabilities: { loadSession: true } },
      {
        sessionId: "agent-session-1",
        modes: {
          currentModeId: "planning",
          availableModes: [{ id: "planning", name: "Planning", description: "Plan first" }],
        },
        models: {
          currentModelId: "gpt-5.5",
          availableModels: [{ modelId: "gpt-5.5", name: "GPT-5.5", description: "frontier" }],
        },
      },
    );
    const bridgeInputs: CreateAcpBridgeInput[] = [];
    const manager = new AcpSessionManager({
      state,
      config: configState,
      createBridge: async (input) => {
        bridgeInputs.push(input);
        return bridge;
      },
      appVersion: "0.1.0-test",
      canAccessFs: false,
    });

    const session = await manager.createSession("codex", "/repo");

    expect(bridgeInputs).toEqual([{ name: "codex", config: config.agents.codex! }]);
    expect(bridge.initializeCalls[0]).toMatchObject({
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } },
      clientInfo: { name: "fulcrum", title: "Fulcrum", version: "0.1.0-test" },
    });
    expect(bridge.newSessionCalls).toEqual([{ cwd: "/repo", mcpServers: [] }]);
    expect(session).toMatchObject({
      id: "session-row-1",
      agentName: "codex",
      sessionId: "agent-session-1",
      cwd: "/repo",
      supportsLoadSession: true,
    });
    expect(state.currentSession).toBe(session);
    expect(state.savedSessions).toEqual([session]);
    expect(state.isConnected).toBe(true);
    expect(state.availableModes).toEqual([{ id: "planning", name: "Planning", description: "Plan first" }]);
    expect(state.currentModeId).toBe("planning");
    expect(state.availableModels).toEqual([{ modelId: "gpt-5.5", name: "GPT-5.5", description: "frontier" }]);
    expect(state.currentModelId).toBe("gpt-5.5");
  });

  test("applies bridge session updates and sends prompts through active session", async () => {
    const state = createAcpSessionState({
      createId: (() => {
        let next = 0;
        return () => `id-${next++}`;
      })(),
      now: () => 100,
    });
    const bridge = new FakeBridge({}, { sessionId: "agent-session-1" });
    const manager = new AcpSessionManager({
      state,
      config: createAcpConfigState({ config }),
      createBridge: async () => bridge,
    });

    await manager.createSession("codex", "/repo");
    bridge.onSessionUpdate?.({
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Ready" } },
    });
    await manager.sendPrompt("Build a plan");

    expect(state.messages.map((message) => `${message.role}:${message.content}`)).toEqual([
      "assistant:Ready",
      "user:Build a plan",
    ]);
    expect(bridge.promptCalls).toEqual([
      {
        sessionId: "agent-session-1",
        prompt: [{ type: "text", text: "Build a plan" }],
      },
    ]);
    expect(state.currentSession?.title).toBe("Build a plan");
  });

  test("proxies mode/model/cancel/permission actions and handles unexpected close", async () => {
    const state = createAcpSessionState({ createId: () => "session-row-1" });
    const bridge = new FakeBridge({}, { sessionId: "agent-session-1" });
    const manager = new AcpSessionManager({
      state,
      config: createAcpConfigState({ config }),
      createBridge: async () => bridge,
    });
    await manager.createSession("codex", "/repo");

    await manager.setMode("review");
    await manager.setModel("gpt-5.4");
    await manager.cancelOperation();
    bridge.onPermissionRequest?.({
      sessionId: "agent-session-1",
      toolCall: {
        toolCallId: "tool-1",
        title: "Write file",
        kind: "write",
        status: "pending",
      },
      options: [{ kind: "allow", name: "Allow", optionId: "allow" }],
    });
    expect(state.pendingPermission?.toolCall.title).toBe("Write file");
    manager.resolvePermission("allow");
    expect(state.pendingPermission).toBeNull();
    bridge.onPermissionRequest?.({
      sessionId: "agent-session-1",
      toolCall: {
        toolCallId: "tool-2",
        title: "Run command",
        kind: "execute",
        status: "pending",
      },
      options: [{ kind: "reject", name: "Reject", optionId: "reject" }],
    });
    manager.cancelPermission();
    expect(state.pendingPermission).toBeNull();
    bridge.onTransportClose?.("network down");

    expect(bridge.setModeCalls).toEqual([{ sessionId: "agent-session-1", modeId: "review" }]);
    expect(bridge.setModelCalls).toEqual([{ sessionId: "agent-session-1", modelId: "gpt-5.4" }]);
    expect(bridge.cancelCalls).toEqual([{ sessionId: "agent-session-1" }]);
    expect(bridge.resolvePermissionCalls).toEqual(["allow"]);
    expect(bridge.cancelPermissionCalls).toBe(1);
    expect(state.isConnected).toBe(false);
    expect(state.error).toBe("Connection lost: network down");
  });

  test("disconnect tears down bridge and session state", async () => {
    const state = createAcpSessionState({ createId: () => "session-row-1" });
    const bridge = new FakeBridge({}, { sessionId: "agent-session-1" });
    const manager = new AcpSessionManager({
      state,
      config: createAcpConfigState({ config }),
      createBridge: async () => bridge,
    });
    await manager.createSession("codex", "/repo");
    state.pendingPermission = {
      sessionId: "agent-session-1",
      toolCall: { toolCallId: "tool-1", title: "Edit file", kind: "edit", status: "pending" },
      options: [{ kind: "allow", name: "Allow", optionId: "allow" }],
    };

    await manager.disconnect();

    expect(bridge.disconnectCalls).toBe(1);
    expect(state.currentSession).toBeNull();
    expect(state.isConnected).toBe(false);
    expect(state.pendingPermission).toBeNull();
  });
});
