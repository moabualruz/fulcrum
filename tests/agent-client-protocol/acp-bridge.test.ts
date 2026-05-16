import { describe, expect, test } from "bun:test";

import { AcpClientBridge } from "@agent-client-protocol/application/acp-bridge.ts";
import {
  createInMemoryTrafficRecorder,
  type TrafficEntryInput,
} from "@agent-client-protocol/application/traffic.ts";
import {
  getTransportKind,
  isRemoteConfig,
  isStdioConfig,
  type PermissionRequest,
} from "@agent-client-protocol/domain/protocol.ts";
import { TransportListeners, type AcpTransport, type Unsubscribe } from "@agent-client-protocol/application/transports/types.ts";
import { buildSubprotocols } from "@agent-client-protocol/application/transports/websocket.ts";

class FakeTransport implements AcpTransport {
  readonly sent: string[] = [];
  private messageListeners = new Set<(json: string) => void>();
  private closeListeners = new Set<(reason?: string) => void>();

  async send(json: string): Promise<void> {
    this.sent.push(json);
  }

  onMessage(cb: (json: string) => void): Unsubscribe {
    this.messageListeners.add(cb);
    return () => this.messageListeners.delete(cb);
  }

  onClose(cb: (reason?: string) => void): Unsubscribe {
    this.closeListeners.add(cb);
    return () => this.closeListeners.delete(cb);
  }

  async close(): Promise<void> {
    this.emitClose("closed by test");
  }

  emitMessage(json: unknown): void {
    const payload = typeof json === "string" ? json : JSON.stringify(json);
    for (const listener of [...this.messageListeners]) listener(payload);
  }

  emitClose(reason?: string): void {
    for (const listener of [...this.closeListeners]) listener(reason);
  }
}

describe("ACP ported protocol foundation", () => {
  test("defaults legacy agent configs to stdio and recognizes remote configs", () => {
    expect(getTransportKind({ command: "codex" })).toBe("stdio");
    expect(isStdioConfig({ command: "codex" })).toBe(true);
    expect(isRemoteConfig({ transport: "websocket", url: "ws://127.0.0.1:9999" })).toBe(true);
    expect(isRemoteConfig({ transport: "http" })).toBe(false);
  });

  test("keeps transport listener mutation safe during emit", () => {
    const listeners = new TransportListeners<string>();
    const seen: string[] = [];
    const unsubscribe = listeners.add((value) => {
      seen.push(`first:${value}`);
      unsubscribe();
    });
    listeners.add((value) => seen.push(`second:${value}`));

    listeners.emit("one");
    listeners.emit("two");

    expect(seen).toEqual(["first:one", "second:one", "second:two"]);
  });

  test("records bounded ACP traffic with deterministic ids", () => {
    const recorder = createInMemoryTrafficRecorder({
      maxEntries: 2,
      now: () => 123,
      createId: (() => {
        let next = 0;
        return () => `traffic-${next++}`;
      })(),
    });

    const entry = (method: string): TrafficEntryInput => ({
      direction: "out",
      type: "request",
      method,
      payload: { method },
    });
    recorder.addEntry(entry("initialize"));
    recorder.addEntry(entry("session/new"));
    recorder.addEntry(entry("session/prompt"));

    expect(recorder.entries.map((item) => item.id)).toEqual(["traffic-1", "traffic-2"]);
    expect(recorder.filteredEntries.map((item) => item.method)).toEqual(["session/new", "session/prompt"]);
  });

  test("sends JSON-RPC requests, resolves responses, and records method traffic", async () => {
    const transport = new FakeTransport();
    const traffic = createInMemoryTrafficRecorder({ createId: () => "traffic", now: () => 1 });
    const bridge = new AcpClientBridge(transport, { trafficRecorder: traffic, requestTimeoutMs: 1000 });

    const initialized = bridge.initialize({ protocolVersion: "1" });
    expect(JSON.parse(transport.sent[0] ?? "{}")).toMatchObject({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: { protocolVersion: "1" },
    });

    transport.emitMessage({ jsonrpc: "2.0", id: 0, result: { protocolVersion: "1", agentCapabilities: {} } });
    await expect(initialized).resolves.toEqual({ protocolVersion: "1", agentCapabilities: {} });
    expect(traffic.entries.map((item) => `${item.direction}:${item.type}:${item.method}`)).toEqual([
      "out:request:initialize",
      "in:response:initialize",
    ]);
  });

  test("responds method-not-found for host filesystem requests when fs is unavailable", async () => {
    const transport = new FakeTransport();
    new AcpClientBridge(transport, { fsAvailable: false });

    transport.emitMessage({
      jsonrpc: "2.0",
      id: "fs-1",
      method: "fs/read_text_file",
      params: { path: "/tmp/file.txt" },
    });
    await Promise.resolve();

    expect(JSON.parse(transport.sent[0] ?? "{}")).toMatchObject({
      jsonrpc: "2.0",
      id: "fs-1",
      error: { code: -32601, message: "fs/read_text_file not available on this client" },
    });
  });

  test("exposes permission requests and sends selected permission response", async () => {
    const transport = new FakeTransport();
    const bridge = new AcpClientBridge(transport, { requestTimeoutMs: 1000 });
    let observedRequest: PermissionRequest | null = null;
    let settledCount = 0;
    bridge.onPermissionRequest = (request) => {
      observedRequest = request;
    };
    bridge.onPermissionSettled = () => {
      settledCount += 1;
    };
    const permission: PermissionRequest = {
      sessionId: "session-1",
      toolCall: {
        toolCallId: "tool-1",
        title: "Edit file",
        kind: "edit",
        status: "pending",
        locations: [{ path: "README.md" }],
      },
      options: [{ kind: "allow", name: "Allow", optionId: "allow" }],
    };

    transport.emitMessage({
      jsonrpc: "2.0",
      id: "permission-1",
      method: "session/request_permission",
      params: permission,
    });
    await Promise.resolve();

    expect(bridge.pendingPermissionRequest).toEqual(permission);
    const seenRequest = observedRequest;
    if (!seenRequest) throw new Error("Expected permission request callback.");
    expect(seenRequest).toEqual(permission);
    bridge.resolvePermission("allow");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(JSON.parse(transport.sent[0] ?? "{}")).toEqual({
      jsonrpc: "2.0",
      id: "permission-1",
      result: { outcome: { outcome: "selected", optionId: "allow" } },
    });
    expect(bridge.pendingPermissionRequest).toBeNull();
    expect(settledCount).toBe(1);
  });

  test("clears pending permission requests when the transport closes", async () => {
    const transport = new FakeTransport();
    const bridge = new AcpClientBridge(transport, { requestTimeoutMs: 1000 });
    let settledCount = 0;
    bridge.onPermissionSettled = () => {
      settledCount += 1;
    };

    transport.emitMessage({
      jsonrpc: "2.0",
      id: "permission-1",
      method: "session/request_permission",
      params: {
        sessionId: "session-1",
        toolCall: { toolCallId: "tool-1", title: "Edit file", kind: "edit", status: "pending" },
        options: [{ kind: "allow", name: "Allow", optionId: "allow" }],
      },
    });
    await Promise.resolve();

    expect(bridge.pendingPermissionRequest?.toolCall.title).toBe("Edit file");
    transport.emitClose("agent exited");
    await Promise.resolve();

    expect(bridge.pendingPermissionRequest).toBeNull();
    expect(settledCount).toBe(1);
    expect(transport.sent).toEqual([]);
  });

  test("rejects in-flight requests when transport closes unexpectedly", async () => {
    const transport = new FakeTransport();
    const bridge = new AcpClientBridge(transport, { requestTimeoutMs: 1000 });

    const pending = bridge.prompt({ sessionId: "session-1", prompt: "plan" });
    transport.emitClose("agent died");

    await expect(pending).rejects.toThrow("transport closed: agent died");
  });

  test("builds websocket subprotocols with case-insensitive bearer header support", () => {
    expect(buildSubprotocols()).toEqual(["acp.v1"]);
    expect(buildSubprotocols({ Authorization: "Bearer token with spaces" })).toEqual([
      "acp.v1",
      "bearer.tokenwithspaces",
    ]);
    expect(buildSubprotocols({ authorization: "Basic nope" })).toEqual(["acp.v1"]);
  });
});
