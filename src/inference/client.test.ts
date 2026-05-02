import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";

import { InferenceClient } from "./client.ts";
import { encodeJsonRpcFrame, type InferenceRequest, type InferenceResponse } from "./protocol.ts";

let scratch = "";

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-inference-client-"));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

function readFrame(socket: net.Socket, onRequest: (request: InferenceRequest) => InferenceResponse): void {
  let buffer = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    buffer = Buffer.concat([buffer, bytes]);
    while (buffer.byteLength >= 4) {
      const len = buffer.readUInt32BE(0);
      if (buffer.byteLength < len + 4) return;
      const body = buffer.subarray(4, 4 + len).toString("utf8");
      buffer = buffer.subarray(4 + len);
      const response = onRequest(JSON.parse(body) as InferenceRequest);
      socket.write(Buffer.from(encodeJsonRpcFrame(response)));
    }
  });
}

async function withServer(
  socketPath: string,
  onRequest: (request: InferenceRequest) => InferenceResponse,
): Promise<net.Server> {
  const server = net.createServer((socket) => readFrame(socket, onRequest));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  return server;
}

function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe("InferenceClient", () => {
  test("call('health', {}) returns typed HealthResult over Unix socket", async () => {
    const socketPath = join(scratch, "inference.sock");
    const server = await withServer(socketPath, (request) => ({
      jsonrpc: "2.0",
      id: request.id,
      result: { status: "ok", backends: ["embedded"], models: [] },
    }));

    try {
      const client = new InferenceClient({
        lifecycle: { ensureRunning: async () => ({ pid: 1234, socketPath }) },
        timeoutMs: 500,
        retryDelaysMs: [1],
      });

      const result = await client.call("health", {});

      expect(result.status).toBe("ok");
      expect(result.backends).toEqual(["embedded"]);
    } finally {
      await closeServer(server);
    }
  });

  test("embed sends texts and model over Unix socket and returns typed vectors", async () => {
    const socketPath = join(scratch, "embed.sock");
    let observedParams: unknown;
    const server = await withServer(socketPath, (request) => {
      observedParams = request.params;
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          vectors: [[0.1, 0.2, 0.3]],
          model: "custom-embed-model",
          cached: true,
        },
      };
    });

    try {
      const client = new InferenceClient({
        lifecycle: { ensureRunning: async () => ({ pid: 1234, socketPath }) },
        timeoutMs: 500,
        retryDelaysMs: [1],
      });

      const result = await client.embed(["hello"], { model: "custom-embed-model" });

      expect(observedParams).toEqual({ texts: ["hello"], model: "custom-embed-model" });
      expect(result).toEqual({
        vectors: [[0.1, 0.2, 0.3]],
        model: "custom-embed-model",
        cached: true,
      });
    } finally {
      await closeServer(server);
    }
  });

  test("retries refused sockets with exponential backoff before succeeding", async () => {
    const socketPath = join(scratch, "retry.sock");
    let attempts = 0;
    let server: net.Server | undefined;

    const client = new InferenceClient({
      lifecycle: { ensureRunning: async () => ({ pid: 1234, socketPath }) },
      timeoutMs: 500,
      retryDelaysMs: [10, 20, 40],
      onRetry: async () => {
        attempts += 1;
        if (attempts === 1) {
          server = await withServer(socketPath, (request) => ({
            jsonrpc: "2.0",
            id: request.id,
            result: { status: "ok", backends: [], models: [] },
          }));
        }
      },
    });

    try {
      const result = await client.call("health", {});

      expect(result.status).toBe("ok");
      expect(attempts).toBeGreaterThanOrEqual(1);
    } finally {
      if (server) await closeServer(server);
    }
  });

  test("throws typed InferenceError after JSON-RPC error response", async () => {
    const socketPath = join(scratch, "error.sock");
    const server = await withServer(socketPath, (request) => ({
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32601,
        message: "Method not found",
        data: { backend: "embedded" },
      },
    }));

    try {
      const client = new InferenceClient({
        lifecycle: { ensureRunning: async () => ({ pid: 1234, socketPath }) },
        timeoutMs: 500,
        retryDelaysMs: [1],
      });

      await expect(client.call("missing", {})).rejects.toMatchObject({
        name: "InferenceError",
        code: -32601,
        backend: "embedded",
        message: "Method not found",
      });
    } finally {
      await closeServer(server);
    }
  });

  test("throws typed InferenceError after exhausting socket retries", async () => {
    const socketPath = join(scratch, "missing.sock");
    const client = new InferenceClient({
      lifecycle: { ensureRunning: async () => ({ pid: 1234, socketPath }) },
      timeoutMs: 100,
      retryDelaysMs: [1, 1],
    });

    await expect(client.call("health", {})).rejects.toMatchObject({
      name: "InferenceError",
      code: -32000,
      backend: "embedded",
    });
  });
});
