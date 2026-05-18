import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";
import type { SessionWorkbenchModel } from "@agent-client-protocol/interface/session-workbench.ts";

type Props = {
  model: SessionWorkbenchModel;
  availableAgents?: { id: string; name: string; cli_path?: string | null; capabilities?: string[]; test_passed?: boolean | null }[];
};

describe("AgentSessionWorkbench component", () => {
  let render: typeof import("svelte/server").render;
  let AgentSessionWorkbench: Component<Props>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./AgentSessionWorkbench.svelte")) as {
      default: Component<Props>;
    };
    AgentSessionWorkbench = mod.default;
  });

  test("renders active session state, selected mode/model, traffic, permission, and messages", () => {
    const { body } = render(AgentSessionWorkbench, { props: { model: activeModel() } });

    expect(body).toContain("data-agent-session-workbench");
    expect(body).toContain('data-session-status="connected"');
    expect(body).toContain("Plan work");
    expect(body).toContain('data-session-mode="planning" data-selected="true"');
    expect(body).toContain('data-session-model="gpt-5.5" data-selected="true"');
    expect(body).toContain("data-session-permission");
    expect(body).toContain("data-permission-backdrop");
    expect(body).toContain('role="dialog"');
    expect(body).toContain('aria-modal="true"');
    expect(body).toContain("Permission required");
    expect(body).toContain("data-permission-tool-kind");
    expect(body).toContain("data-permission-paths");
    expect(body).toContain("services/planning-review/src/application/planning-workflow.ts");
    expect(body).toContain("data-permission-timeout-policy");
    expect(body).toContain('data-permission-option="allow_once"');
    expect(body).toContain('data-permission-option="allow_always"');
    expect(body).toContain('data-permission-option="deny"');
    expect(body).toContain('data-permission-option="cancel"');
    expect(body).toContain("option-allow-once");
    expect(body).toContain("option-allow-always");
    expect(body).toContain("option-deny");
    expect(body).toContain("data-session-resume");
    expect(body).toContain('data-resume-session="row-2"');
    expect(body).toContain('data-session-item="row-2"');
    expect(body).toContain('data-session-row-status="saved"');
    expect(body).toContain('data-delete-session="row-2"');
    expect(body).toContain("delete-btn");
    expect(body).toContain("data-traffic-filter");
    expect(body).toContain("data-traffic-search");
    expect(body).toContain("data-traffic-pause");
    expect(body).toContain('data-traffic-error="true"');
    expect(body).toContain("tool/error");
    expect(body).toContain("data-inline-diff");
    expect(body).toContain('data-syntax-language="ts"');
    expect(body).toContain("data-old-line");
    expect(body).toContain("data-new-line");
    expect(body).toContain("diff-accept-btn");
    expect(body).toContain("diff-reject-btn");
    expect(body).toContain("data-diff-accepted");
    expect(body).toContain("data-diff-reject-reason");
    expect(body).toContain("data-session-transcript");
    expect(body).toContain('data-autoscroll-locked="false"');
    expect(body).toContain('data-message-role="user"');
    expect(body).toContain("copy-btn");
    expect(body).toContain("data-message-markdown");
    expect(body).toContain("<strong>plan</strong>");
    expect(body).toContain("<pre><code>bun test</code></pre>");
    expect(body).toContain("data-message-toolcalls");
    expect(body).toContain("Build the <strong>plan</strong>");
    expect(body).toContain("session/update");
    expect(body).toContain("abort-btn");
    expect(body).toContain("pause-btn");
    expect(body).not.toContain("data-session-empty");
    expect(body).not.toContain("data-reconnect-banner");
  });

  test("renders idle state without enabling active controls", () => {
    const { body } = render(AgentSessionWorkbench, { props: { model: idleModel() } });

    expect(body).toContain('data-session-status="idle"');
    expect(body).toContain("data-session-empty");
    expect(body).toContain("data-session-empty-state");
    expect(body).toContain("No saved sessions yet.");
    expect(body).toContain("data-session-list-empty");
    expect(body).toContain("Create a new session to Begin.");
    expect(body).toContain("Create Session");
    expect(body).toContain('href="#agent-connect-form"');
    expect(body).toContain("empty-create-btn");
    expect(body).toContain("No messages");
    expect(body).toContain("data-connect-bridge");
    expect(body).toContain("data-agent-picker-empty");
    expect(body).toContain("cwd-input");
    expect(body).toContain('name="cwd"');
    expect(body).toContain("Working directory");
    expect(body).not.toContain("folder-picker-btn");
    expect(body).not.toContain("data-session-permission");
  });

  test("renders clickable agent picker options with selected state", () => {
    const { body } = render(AgentSessionWorkbench, {
      props: {
        model: idleModel(),
        availableAgents: [
          { id: "codex", name: "codex", cli_path: "codex", capabilities: ["code", "llm"] },
          {
            id: "very-long",
            name: "very-long-agent-name-that-needs-truncation-on-mobile",
            cli_path: "/usr/local/bin/very-long-agent-command",
            capabilities: ["review"],
          },
        ],
      },
    });

    expect(body).toContain("data-agent-picker");
    expect(body).toContain('data-agent-option="codex"');
    expect(body).toContain('data-selected="true"');
    expect(body).toContain('name="agentName"');
    expect(body).toContain('value="codex"');
    expect(body).toContain("agent-option");
    expect(body).toContain("very-long-agent-name-that-needs-truncation-on-mobile");
    expect(body).toContain('name="command"');
    expect(body).toContain('value="codex"');
    expect(body).toContain('placeholder="/path/to/repository"');
    expect(body).not.toContain("data-agent-picker-empty");
  });

  test("renders reconnect progress, manual recovery, and dismiss action", () => {
    const model = reconnectModel();
    const { body } = render(AgentSessionWorkbench, { props: { model } });

    expect(body).toContain('data-session-status="error"');
    expect(body).toContain("data-reconnect-banner");
    expect(body).toContain('data-reconnect-exhausted="true"');
    expect(body).toContain("Reconnect needed");
    expect(body).toContain("Reconnect codex");
    expect(body).toContain("manual-reconnect-btn");
    expect(body).toContain("dismiss-error-btn");
    expect(body).toContain("Check the agent process");
  });

  test("renders paused session resume state and abort confirmation affordance", () => {
    const model = activeModel();
    model.connection.paused = true;
    model.controls.canPauseSession = false;
    model.controls.canResumeSession = true;
    const { body } = render(AgentSessionWorkbench, { props: { model } });

    expect(body).toContain("data-session-paused");
    expect(body).toContain("AI Assist is paused.");
    expect(body).toContain("resume-btn");
    expect(body).toContain("abort-btn");
    expect(body).toContain("data-abort-session-form");
  });
});

function activeModel(): SessionWorkbenchModel {
  return {
    connection: {
      status: "connected",
      busy: true,
      error: null,
      startup: { phase: "starting", elapsed: 0, logs: [] },
      reconnect: { attempts: 0, maxAttempts: 3, exhausted: false, agentName: "codex" },
      paused: false,
    },
    session: {
      id: "row-1",
      sessionId: "agent-session-1",
      title: "Plan work",
      agentName: "codex",
      cwd: "/repo",
      lastUpdated: 1,
      supportsResume: true,
    },
    controls: {
      canPrompt: true,
      canCancel: true,
      canDisconnect: true,
      canResolvePermission: true,
      canChangeMode: true,
      canChangeModel: true,
      canResume: true,
      canReconnect: false,
      canAbort: true,
      canPauseSession: true,
      canResumeSession: false,
    },
    modes: [
      { id: "planning", name: "Planning", selected: true },
      { id: "review", name: "Review", selected: false },
    ],
    models: [
      { modelId: "gpt-5.5", name: "GPT-5.5", selected: true },
      { modelId: "gpt-5.4", name: "GPT-5.4", selected: false },
    ],
    messages: [
      {
        id: "message-1",
        role: "user",
        content: "Build the **plan**\n\n```sh\nbun test\n```",
        timestamp: 1,
        toolCalls: [{ toolCallId: "tool-1", title: "Read brief", kind: "read", status: "in_progress" }],
      },
    ],
    toolCalls: {
      items: [
        { toolCallId: "tool-1", title: "Read brief", kind: "read", status: "in_progress" },
        {
          toolCallId: "tool-diff",
          title: "Edit src/app.ts",
          kind: "write",
          status: "completed",
          diffs: [
            {
              id: "diff-1",
              filePath: "src/app.ts",
              language: "ts",
              status: "accepted",
              lines: [
                { oldLine: 1, newLine: 1, kind: "context", content: "export function run() {" },
                { oldLine: 2, newLine: null, kind: "remove", content: "return false;" },
                { oldLine: null, newLine: 2, kind: "add", content: "return true;" },
              ],
            },
          ],
        },
      ],
      summary: { total: 2, pending: 0, inProgress: 1, completed: 1, failed: 0 },
    },
    permission: {
      sessionId: "agent-session-1",
      toolCall: {
        toolCallId: "tool-2",
        title: "Write file",
        kind: "write",
        status: "pending",
        locations: [{ path: "services/planning-review/src/application/planning-workflow.ts" }],
      },
      options: [
        { optionId: "allow_once", kind: "allow", name: "Allow Once" },
        { optionId: "allow_always", kind: "allow", name: "Allow Always" },
        { optionId: "deny", kind: "deny", name: "Deny" },
        { optionId: "cancel", kind: "cancel", name: "Cancel" },
      ],
    },
    traffic: {
      entries: [
        {
          id: "traffic-1",
          timestamp: 1,
          direction: "in",
          type: "notification",
          method: "session/update",
          payload: {},
        },
        {
          id: "traffic-2",
          timestamp: 2,
          direction: "out",
          type: "response",
          method: "tool/error",
          payload: {},
          error: true,
        },
      ],
      filteredEntries: [
        {
          id: "traffic-1",
          timestamp: 1,
          direction: "in",
          type: "notification",
          method: "session/update",
          payload: {},
        },
        {
          id: "traffic-2",
          timestamp: 2,
          direction: "out",
          type: "response",
          method: "tool/error",
          payload: {},
          error: true,
        },
      ],
      paused: true,
      filter: "all",
      searchQuery: "",
      summary: { total: 2, requests: 0, responses: 1, notifications: 1, errors: 1 },
    },
    resumableSessions: [
      {
        id: "row-2",
        sessionId: "agent-session-2",
        title: "Older work",
        agentName: "codex",
        cwd: "/repo",
        lastUpdated: 0,
        supportsResume: true,
      },
    ],
    sessions: [
      {
        id: "row-1",
        sessionId: "agent-session-1",
        title: "Plan work",
        agentName: "codex",
        cwd: "/repo",
        lastUpdated: 1,
        supportsResume: true,
        status: "running",
        current: true,
      },
      {
        id: "row-2",
        sessionId: "agent-session-2",
        title: "Older work",
        agentName: "codex",
        cwd: "/repo",
        lastUpdated: 0,
        supportsResume: true,
        status: "saved",
        current: false,
      },
    ],
  };
}

function idleModel(): SessionWorkbenchModel {
  return {
    connection: {
      status: "idle",
      busy: false,
      error: null,
      startup: { phase: "starting", elapsed: 0, logs: [] },
      reconnect: { attempts: 0, maxAttempts: 3, exhausted: false, agentName: null },
      paused: false,
    },
    session: null,
    controls: {
      canPrompt: false,
      canCancel: false,
      canDisconnect: false,
      canResolvePermission: false,
      canChangeMode: false,
      canChangeModel: false,
      canResume: false,
      canReconnect: false,
      canAbort: false,
      canPauseSession: false,
      canResumeSession: false,
    },
    modes: [],
    models: [],
    messages: [],
    toolCalls: {
      items: [],
      summary: { total: 0, pending: 0, inProgress: 0, completed: 0, failed: 0 },
    },
    permission: null,
    traffic: {
      entries: [],
      filteredEntries: [],
      paused: false,
      filter: "all",
      searchQuery: "",
      summary: { total: 0, requests: 0, responses: 0, notifications: 0, errors: 0 },
    },
    resumableSessions: [],
    sessions: [],
  };
}

function reconnectModel(): SessionWorkbenchModel {
  const model = activeModel();
  model.connection.status = "error";
  model.connection.busy = false;
  model.connection.error = "Reconnect failed: agent unavailable. Check the agent process and try again.";
  model.connection.reconnect = { attempts: 3, maxAttempts: 3, exhausted: true, agentName: "codex" };
  model.controls.canPrompt = false;
  model.controls.canCancel = false;
  model.controls.canDisconnect = false;
  model.controls.canReconnect = true;
  return model;
}
