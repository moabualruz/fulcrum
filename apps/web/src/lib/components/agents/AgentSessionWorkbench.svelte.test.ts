import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";
import type { SessionWorkbenchModel } from "@agent-client-protocol/interface/session-workbench.ts";

type Props = {
  model: SessionWorkbenchModel;
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
    expect(body).toContain('data-permission-option="allow_once"');
    expect(body).toContain("data-session-resume");
    expect(body).toContain('data-resume-session="row-2"');
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
    expect(body).toContain("Build the plan");
    expect(body).toContain("session/update");
    expect(body).not.toContain("data-session-empty");
  });

  test("renders idle state without enabling active controls", () => {
    const { body } = render(AgentSessionWorkbench, { props: { model: idleModel() } });

    expect(body).toContain('data-session-status="idle"');
    expect(body).toContain("data-session-empty");
    expect(body).toContain("data-session-empty-state");
    expect(body).toContain("No saved sessions yet.");
    expect(body).toContain("Create a new session to Begin.");
    expect(body).toContain("Create Session");
    expect(body).toContain('href="#agent-connect-form"');
    expect(body).toContain("empty-create-btn");
    expect(body).toContain("No messages");
    expect(body).toContain("data-connect-bridge");
    expect(body).not.toContain("data-session-permission");
  });
});

function activeModel(): SessionWorkbenchModel {
  return {
    connection: {
      status: "connected",
      busy: true,
      error: null,
      startup: { phase: "starting", elapsed: 0, logs: [] },
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
      { id: "message-1", role: "user", content: "Build the plan", timestamp: 1 },
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
      toolCall: { toolCallId: "tool-2", title: "Write file", kind: "write", status: "pending" },
      options: [{ optionId: "allow_once", kind: "allow", name: "Allow once" }],
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
  };
}

function idleModel(): SessionWorkbenchModel {
  return {
    connection: {
      status: "idle",
      busy: false,
      error: null,
      startup: { phase: "starting", elapsed: 0, logs: [] },
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
  };
}
