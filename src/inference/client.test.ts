import { describe, expect, test } from "bun:test";

import { InferenceClient } from "./client.ts";
import type { InferenceRequest, InferenceResponse } from "./protocol.ts";

function clientWithTransport(
  onRequest: (request: InferenceRequest) => InferenceResponse | Promise<InferenceResponse>,
): InferenceClient {
  return new InferenceClient({
    transport: async (request) => onRequest(request),
    timeoutMs: 500,
    retryDelaysMs: [1],
  });
}

describe("InferenceClient", () => {
  test("call('health', {}) returns typed HealthResult", async () => {
    const client = clientWithTransport((request) => ({
      jsonrpc: "2.0",
      id: request.id,
      result: { status: "ok", backends: ["embedded"], models: [] },
    }));

    const result = await client.call("health", {});

    expect(result.status).toBe("ok");
    expect(result.backends).toEqual(["embedded"]);
  });

  test("embed sends texts and model and returns typed vectors", async () => {
    let observedParams: unknown;
    const client = clientWithTransport((request) => {
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

    const result = await client.embed(["hello"], { model: "custom-embed-model" });

    expect(observedParams).toEqual({ texts: ["hello"], model: "custom-embed-model" });
    expect(result).toEqual({
      vectors: [[0.1, 0.2, 0.3]],
      model: "custom-embed-model",
      cached: true,
    });
  });

  test("classify sends text and labels and returns sorted label scores", async () => {
    let observedParams: unknown;
    const client = clientWithTransport((request) => {
      observedParams = request.params;
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: [
          { label: "task", score: 0.83 },
          { label: "question", score: 0.12 },
        ],
      };
    });

    const result = await client.classify("buy groceries", ["task", "question"]);

    expect(observedParams).toEqual({ text: "buy groceries", labels: ["task", "question"] });
    expect(result).toEqual([
      { label: "task", score: 0.83 },
      { label: "question", score: 0.12 },
    ]);
  });

  test("tokenize sends text and optional model and returns count plus tokens", async () => {
    let observedParams: unknown;
    const client = clientWithTransport((request) => {
      observedParams = request.params;
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: { count: 2, tokens: ["hello", "world"] },
      };
    });

    const result = await client.tokenize("hello world", "fixture-tokenizer");

    expect(observedParams).toEqual({ text: "hello world", model: "fixture-tokenizer" });
    expect(result).toEqual({ count: 2, tokens: ["hello", "world"] });
  });

  test("listModels calls models.list and normalizes registry metadata", async () => {
    let observedMethod: string | undefined;
    let observedParams: unknown;
    const client = clientWithTransport((request) => {
      observedMethod = request.method;
      observedParams = request.params;
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: [{
          id: "BAAI/bge-small-en-v1.5",
          kind: "embed",
          downloaded: true,
          active: true,
          size_bytes: 133466304,
          size_bytes_actual: 133466304,
        }],
      };
    });

    const result = await client.listModels();

    expect(observedMethod).toBe("models.list");
    expect(observedParams).toEqual({});
    expect(result).toEqual([{
      id: "BAAI/bge-small-en-v1.5",
      kind: "embed",
      downloaded: true,
      active: true,
      sizeBytes: 133466304,
      sizeBytesActual: 133466304,
    }]);
  });

  test("pullModel calls models.pull with force flag and yields progress events", async () => {
    let observedParams: unknown;
    const client = clientWithTransport((request) => {
      observedParams = request.params;
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: [
          { type: "download_progress", pct: 0, downloaded: 0, total: 10 },
          { type: "download_progress", pct: 100, downloaded: 10, total: 10 },
        ],
      };
    });

    const events = [];
    for await (const event of client.pullModel("BAAI/bge-small-en-v1.5", { force: true })) {
      events.push(event);
    }

    expect(observedParams).toEqual({ modelId: "BAAI/bge-small-en-v1.5", force: true });
    expect(events).toEqual([
      { type: "download_progress", pct: 0, downloaded: 0, total: 10 },
      { type: "download_progress", pct: 100, downloaded: 10, total: 10 },
    ]);
  });

  test("rmModel calls models.rm and returns ok status", async () => {
    let observedParams: unknown;
    const client = clientWithTransport((request) => {
      observedParams = request.params;
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: { ok: true },
      };
    });

    const result = await client.rmModel("BAAI/bge-small-en-v1.5");

    expect(observedParams).toEqual({ modelId: "BAAI/bge-small-en-v1.5" });
    expect(result).toEqual({ ok: true });
  });

  test("retries retryable transport failures before succeeding", async () => {
    let attempts = 0;
    const client = new InferenceClient({
      transport: async (request) => {
        attempts += 1;
        if (attempts === 1) {
          const error = new Error("reset");
          (error as Error & { code?: string }).code = "ECONNRESET";
          throw error;
        }
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: { status: "ok", backends: [], models: [] },
        };
      },
      timeoutMs: 500,
      retryDelaysMs: [1, 1],
    });

    const result = await client.call("health", {});

    expect(result.status).toBe("ok");
    expect(attempts).toBe(2);
  });

  test("throws typed InferenceError after JSON-RPC error response", async () => {
    const client = clientWithTransport((request) => ({
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32601,
        message: "Method not found",
        data: { backend: "embedded" },
      },
    }));

    await expect(client.call("missing", {})).rejects.toMatchObject({
      name: "InferenceError",
      code: -32601,
      backend: "embedded",
      message: "Method not found",
    });
  });

  test("throws typed InferenceError after exhausting socket retries", async () => {
    const client = new InferenceClient({
      lifecycle: { ensureRunning: async () => ({ pid: 1234, socketPath: "/missing.sock" }) },
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
