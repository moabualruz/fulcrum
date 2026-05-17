import { describe, expect, test } from "bun:test";

import {
  createAcpConfigState,
  type AcpConfigState,
} from "@agent-client-protocol/application/config-store.ts";
import {
  applySessionNotification,
  createAcpSessionState,
  detectStartupPhase,
} from "@agent-client-protocol/application/session-store.ts";
import type { AgentsConfig } from "@agent-client-protocol/domain/protocol.ts";

const sampleConfig: AgentsConfig = {
  agents: {
    codex: { command: "codex", args: ["--json"] },
    remote: { transport: "websocket", url: "ws://127.0.0.1:9999" },
    http: { transport: "http", url: "https://agent.example.test/acp" },
  },
};

describe("ACP ported config store", () => {
  test("classifies agents and filters stdio when host restricts transports", () => {
    const unrestricted = createAcpConfigState({ config: sampleConfig, restrictedTransports: false });
    expect(unrestricted.allAgentNames).toEqual(["codex", "remote", "http"]);
    expect(unrestricted.agentNames).toEqual(["codex", "remote", "http"]);
    expect(unrestricted.stdioAgentNames).toEqual(["codex"]);
    expect(unrestricted.remoteAgentNames).toEqual(["remote", "http"]);
    expect(unrestricted.getAgentTransportKind("missing")).toBe("stdio");

    const restricted = createAcpConfigState({ config: sampleConfig, restrictedTransports: true });
    expect(restricted.agentNames).toEqual(["remote", "http"]);
    expect(restricted.hasAgents).toBe(true);
  });

  test("updates config from hot-reload events and clears errors", () => {
    const state: AcpConfigState = createAcpConfigState({
      config: { agents: {} },
      configPath: "/tmp/acp.json",
      error: "bad config",
    });

    state.updateFromEvent(sampleConfig);
    state.clearError();

    expect(state.config).toEqual(sampleConfig);
    expect(state.configPath).toBe("/tmp/acp.json");
    expect(state.error).toBeNull();
    expect(state.getAgent("remote")).toEqual(sampleConfig.agents.remote);
  });
});

describe("ACP ported session store", () => {
  test("detects startup phases from stderr lines", () => {
    expect(detectStartupPhase("Downloading packages")).toBe("downloading");
    expect(detectStartupPhase("added 9 packages")).toBe("installing");
    expect(detectStartupPhase("compiling bridge")).toBe("building");
    expect(detectStartupPhase("spawn worker")).toBe("starting");
    expect(detectStartupPhase("ready")).toBeNull();
  });

  test("merges user, assistant, thought, tool call, mode, and slash command updates", () => {
    const state = createAcpSessionState({
      createId: (() => {
        let next = 0;
        return () => `msg-${next++}`;
      })(),
      now: () => 42,
    });

    applySessionNotification(state, {
      update: { sessionUpdate: "user_message_chunk", content: { type: "text", text: "Make " } },
    });
    applySessionNotification(state, {
      update: { sessionUpdate: "user_message_chunk", content: { type: "text", text: "a plan" } },
    });
    applySessionNotification(state, {
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Plan" } },
    });
    applySessionNotification(state, {
      update: { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "Thinking" } },
    });
    applySessionNotification(state, {
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "tool-1",
        title: "Read docs",
        kind: "read",
        status: "pending",
        locations: [{ path: "README.md" }],
      },
    });
    applySessionNotification(state, {
      update: { sessionUpdate: "tool_call_update", toolCallId: "tool-1", status: "completed", title: "Read README" },
    });
    applySessionNotification(state, {
      update: { sessionUpdate: "current_mode_update", modeId: "planning" },
    });
    applySessionNotification(state, {
      update: {
        sessionUpdate: "available_commands_update",
        availableCommands: [{ name: "/plan", description: "Plan work", input: { hint: "goal" } }],
      },
    });

    expect(state.messages).toEqual([
      { id: "msg-0", role: "user", content: "Make a plan", timestamp: 42 },
      {
        id: "msg-1",
        role: "assistant",
        content: "Plan",
        thought: "Thinking",
        timestamp: 42,
        toolCalls: [
          {
            toolCallId: "tool-1",
            title: "Read README",
            kind: "read",
            status: "completed",
            locations: [{ path: "README.md" }],
          },
        ],
      },
    ]);
    expect(state.toolCallList).toEqual([
      {
        toolCallId: "tool-1",
        title: "Read README",
        kind: "read",
        status: "completed",
        locations: [{ path: "README.md" }],
      },
    ]);
    expect(state.currentModeId).toBe("planning");
    expect(state.availableCommands).toEqual([{ name: "/plan", description: "Plan work", hint: "goal" }]);
  });

  test("tracks saved/resumable sessions and clears active state on disconnect", () => {
    const state = createAcpSessionState();
    state.savedSessions = [
      { id: "one", agentName: "codex", sessionId: "s1", title: "One", lastUpdated: 1, cwd: "/repo" },
      {
        id: "two",
        agentName: "remote",
        sessionId: "s2",
        title: "Two",
        lastUpdated: 2,
        cwd: "/repo",
        supportsLoadSession: true,
      },
    ];
    state.currentSession = state.savedSessions[1] ?? null;
    state.isConnected = true;
    state.availableModes = [{ id: "planning", name: "Planning" }];
    state.currentModeId = "planning";
    state.availableModels = [{ modelId: "gpt", name: "GPT" }];
    state.currentModelId = "gpt";

    expect(state.hasActiveSession).toBe(true);
    expect(state.resumableSessions.map((session) => session.id)).toEqual(["two"]);

    state.disconnectState();

    expect(state.currentSession).toBeNull();
    expect(state.isConnected).toBe(false);
    expect(state.messages).toEqual([]);
    expect(state.availableModes).toEqual([]);
    expect(state.availableModels).toEqual([]);
  });
});
