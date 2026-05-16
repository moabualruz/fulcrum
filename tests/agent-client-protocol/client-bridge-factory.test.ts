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

  test("rejects unsupported HTTP ACP configs explicitly", async () => {
    await expect(createAcpClientBridge({ config: { transport: "http", url: "http://127.0.0.1:1234" } })).rejects.toThrow(
      "ACP HTTP transport is not implemented",
    );
  });
});

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
