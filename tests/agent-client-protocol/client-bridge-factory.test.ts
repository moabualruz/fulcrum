import { describe, expect, test } from "bun:test";

import { createAcpClientBridge } from "@agent-client-protocol/application/client-bridge-factory.ts";
import { createInMemoryTrafficRecorder } from "@agent-client-protocol/application/traffic.ts";

describe("ACP client bridge factory", () => {
  test("creates a stdio bridge for local agent configs", async () => {
    const traffic = createInMemoryTrafficRecorder({ now: () => 1, createId: () => "traffic-id" });
    const bridge = await createAcpClientBridge({
      config: {
        command: process.execPath,
        args: ["-e", inlineAgentScript],
      },
      trafficRecorder: traffic,
      requestTimeoutMs: 1_000,
    });

    await expect(bridge.initialize({ protocolVersion: 1 })).resolves.toEqual({
      agentCapabilities: { loadSession: true },
    });
    await expect(bridge.newSession({ cwd: "/repo" })).resolves.toEqual({
      sessionId: "agent-session-1",
      modes: { currentModeId: "planning", availableModes: [{ id: "planning", name: "Planning" }] },
      models: { currentModelId: "gpt-5.5", availableModels: [{ modelId: "gpt-5.5", name: "GPT-5.5" }] },
    });
    await bridge.disconnect();

    expect(traffic.entries.map((entry) => `${entry.direction}:${entry.type}:${entry.method}`)).toEqual([
      "out:request:initialize",
      "in:response:initialize",
      "out:request:session/new",
      "in:response:session/new",
    ]);
  });

  test("proxies live stdio permission requests back to the agent prompt", async () => {
    const traffic = createInMemoryTrafficRecorder({ now: () => 1, createId: () => "traffic-id" });
    const bridge = await createAcpClientBridge({
      config: {
        command: process.execPath,
        args: ["-e", permissionAgentScript],
      },
      trafficRecorder: traffic,
      requestTimeoutMs: 1_000,
    });
    let permissionTitle = "";
    bridge.onPermissionRequest = (request) => {
      permissionTitle = request.toolCall.title;
    };

    await bridge.initialize({ protocolVersion: 1 });
    await bridge.newSession({ cwd: "/repo" });
    const promptResult = bridge.prompt({
      sessionId: "agent-session-1",
      prompt: [{ type: "text", text: "edit file" }],
    });
    await waitFor(() => permissionTitle === "Write generated plan");
    bridge.resolvePermission("allow_once");

    await expect(promptResult).resolves.toEqual({
      stopReason: "end_turn",
      permissionOutcome: "allow_once",
    });
    await bridge.disconnect();

    expect(traffic.entries.map((entry) => `${entry.direction}:${entry.type}:${entry.method}`)).toContain(
      "in:request:session/request_permission",
    );
    expect(traffic.entries.map((entry) => `${entry.direction}:${entry.type}:${entry.method}`)).toContain(
      "out:response:session/request_permission",
    );
  });

  test("rejects unsupported HTTP ACP configs explicitly", async () => {
    await expect(createAcpClientBridge({ config: { transport: "http", url: "http://127.0.0.1:1234" } })).rejects.toThrow(
      "ACP HTTP transport is not implemented",
    );
  });
});

async function waitFor(assertion: () => boolean): Promise<void> {
  const startedAt = Date.now();
  while (!assertion()) {
    if (Date.now() - startedAt > 1_000) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const inlineAgentScript = `
  process.stdin.setEncoding("utf8");
  let buffer = "";
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    while (true) {
      const index = buffer.indexOf("\\n");
      if (index === -1) break;
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      const request = JSON.parse(line);
      const result = request.method === "initialize"
        ? { agentCapabilities: { loadSession: true } }
        : {
            sessionId: "agent-session-1",
            modes: { currentModeId: "planning", availableModes: [{ id: "planning", name: "Planning" }] },
            models: { currentModelId: "gpt-5.5", availableModels: [{ modelId: "gpt-5.5", name: "GPT-5.5" }] },
          };
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\\n");
    }
  });
`;

const permissionAgentScript = `
  process.stdin.setEncoding("utf8");
  let buffer = "";
  const pendingPrompts = new Map();
  function send(message) {
    process.stdout.write(JSON.stringify(message) + "\\n");
  }
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    while (true) {
      const index = buffer.indexOf("\\n");
      if (index === -1) break;
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      const request = JSON.parse(line);
      if (request.method === "initialize") {
        send({ jsonrpc: "2.0", id: request.id, result: { agentCapabilities: { loadSession: true } } });
      } else if (request.method === "session/new") {
        send({ jsonrpc: "2.0", id: request.id, result: { sessionId: "agent-session-1" } });
      } else if (request.method === "session/prompt") {
        pendingPrompts.set(99, request.id);
        send({
          jsonrpc: "2.0",
          id: 99,
          method: "session/request_permission",
          params: {
            sessionId: "agent-session-1",
            toolCall: { toolCallId: "tool-1", title: "Write generated plan", kind: "write", status: "pending" },
            options: [{ kind: "allow", name: "Allow once", optionId: "allow_once" }],
          },
        });
      } else if (request.id === 99) {
        const promptId = pendingPrompts.get(99);
        pendingPrompts.delete(99);
        send({
          jsonrpc: "2.0",
          id: promptId,
          result: {
            stopReason: "end_turn",
            permissionOutcome: request.result?.outcome?.optionId,
          },
        });
      }
    }
  });
`;
