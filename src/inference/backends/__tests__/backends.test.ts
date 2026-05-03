import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import type {
  InferenceBackend,
  EmbedRequest,
  GenerateRequest,
  ClassifyRequest,
  TokenizeRequest,
  HealthResult,
} from "../types.ts";
import { EmbeddedBackend } from "../embedded.ts";
import { OllamaBackend } from "../ollama.ts";
import { LmStudioBackend } from "../lm-studio.ts";
import { OpenAICompatibleBackend } from "../openai-compatible.ts";

// ── helpers ────────────────────────────────────────────────────────────

const EMBED_REQ: EmbedRequest = { model: "test-model", input: "hello" };
const GEN_REQ: GenerateRequest = { model: "test-model", prompt: "hi" };
const CLASSIFY_REQ: ClassifyRequest = {
  model: "test-model",
  input: "good product",
  labels: ["positive", "negative"],
};
const TOKENIZE_REQ: TokenizeRequest = { model: "test-model", input: "hello" };

/** Stub fetch to return canned JSON per URL pattern */
function stubFetch(
  handlers: Record<string, unknown>,
): ReturnType<typeof mock> {
  const fn = mock((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    for (const [pattern, body] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

// ── Interface contract ─────────────────────────────────────────────────

function assertImplementsBackend(backend: InferenceBackend) {
  expect(typeof backend.embed).toBe("function");
  expect(typeof backend.generate).toBe("function");
  expect(typeof backend.classify).toBe("function");
  expect(typeof backend.tokenize).toBe("function");
  expect(typeof backend.health).toBe("function");
  expect(typeof backend.id).toBe("string");
}

// ── EmbeddedBackend ────────────────────────────────────────────────────

describe("EmbeddedBackend", () => {
  let original: typeof fetch;
  beforeEach(() => {
    original = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = original;
  });

  it("implements InferenceBackend", () => {
    const b = new EmbeddedBackend();
    assertImplementsBackend(b);
    expect(b.id).toBe("embedded");
  });

  it("embed() routes to unix socket", async () => {
    stubFetch({
      "/embed": { vectors: [[0.1, 0.2]], model: "test-model", cached: false },
    });
    const b = new EmbeddedBackend("http://localhost:9999");
    const res = await b.embed(EMBED_REQ);
    expect(res.vectors).toEqual([[0.1, 0.2]]);
    expect(res.model).toBe("test-model");
  });

  it("generate() returns text", async () => {
    stubFetch({
      "/generate": { text: "world", model: "test-model", tokens: 1 },
    });
    const b = new EmbeddedBackend("http://localhost:9999");
    const res = await b.generate(GEN_REQ);
    expect(res.text).toBe("world");
    expect(res.tokens).toBe(1);
  });

  it("health() returns ok", async () => {
    stubFetch({
      "/health": { status: "ok", version: "0.1.0", models: ["m1"] },
    });
    const b = new EmbeddedBackend("http://localhost:9999");
    const h = await b.health();
    expect(h.backend).toBe("embedded");
    expect(h.status).toBe("ok");
  });

  it("health() returns down on fetch error", async () => {
    globalThis.fetch = (() =>
      Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch;
    const b = new EmbeddedBackend("http://localhost:9999");
    const h = await b.health();
    expect(h.status).toBe("down");
    expect(h.error).toContain("ECONNREFUSED");
  });
});

// ── OllamaBackend ──────────────────────────────────────────────────────

describe("OllamaBackend", () => {
  let original: typeof fetch;
  beforeEach(() => {
    original = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = original;
  });

  it("implements InferenceBackend", () => {
    const b = new OllamaBackend();
    assertImplementsBackend(b);
    expect(b.id).toBe("ollama");
  });

  it("embed() routes to localhost:11434/api/embed", async () => {
    const fn = stubFetch({
      "/api/embed": {
        embeddings: [[0.3, 0.4]],
        model: "test-model",
      },
    });
    const b = new OllamaBackend();
    const res = await b.embed(EMBED_REQ);
    expect(res.vectors).toEqual([[0.3, 0.4]]);
    // verify correct URL
    const calledUrl = String((fn as any).mock.calls[0][0]);
    expect(calledUrl).toContain("11434/api/embed");
  });

  it("generate() routes to /api/generate", async () => {
    stubFetch({
      "/api/generate": {
        response: "answer",
        model: "test-model",
        eval_count: 5,
      },
    });
    const b = new OllamaBackend();
    const res = await b.generate(GEN_REQ);
    expect(res.text).toBe("answer");
    expect(res.tokens).toBe(5);
  });

  it("health() returns ok when reachable", async () => {
    stubFetch({ "/api/tags": { models: [{ name: "m1" }] } });
    const b = new OllamaBackend();
    const h = await b.health();
    expect(h.backend).toBe("ollama");
    expect(h.status).toBe("ok");
  });
});

// ── LmStudioBackend ────────────────────────────────────────────────────

describe("LmStudioBackend", () => {
  let original: typeof fetch;
  beforeEach(() => {
    original = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = original;
  });

  it("implements InferenceBackend", () => {
    const b = new LmStudioBackend();
    assertImplementsBackend(b);
    expect(b.id).toBe("lm-studio");
  });

  it("embed() routes to /v1/embeddings", async () => {
    const fn = stubFetch({
      "/v1/embeddings": {
        data: [{ embedding: [0.5, 0.6] }],
        model: "test-model",
      },
    });
    const b = new LmStudioBackend();
    const res = await b.embed(EMBED_REQ);
    expect(res.vectors).toEqual([[0.5, 0.6]]);
    const calledUrl = String((fn as any).mock.calls[0][0]);
    expect(calledUrl).toContain("1234/v1/embeddings");
  });

  it("generate() routes to /v1/chat/completions", async () => {
    stubFetch({
      "/v1/chat/completions": {
        choices: [{ message: { content: "reply" } }],
        model: "test-model",
        usage: { completion_tokens: 3 },
      },
    });
    const b = new LmStudioBackend();
    const res = await b.generate(GEN_REQ);
    expect(res.text).toBe("reply");
    expect(res.tokens).toBe(3);
  });

  it("health() returns ok", async () => {
    stubFetch({ "/v1/models": { data: [{ id: "m1" }] } });
    const b = new LmStudioBackend();
    const h = await b.health();
    expect(h.backend).toBe("lm-studio");
    expect(h.status).toBe("ok");
  });
});

// ── OpenAICompatibleBackend ────────────────────────────────────────────

describe("OpenAICompatibleBackend", () => {
  let original: typeof fetch;
  let origEnv: Record<string, string | undefined>;
  beforeEach(() => {
    original = globalThis.fetch;
    origEnv = {
      FULCRUM_INFERENCE_URL: process.env["FULCRUM_INFERENCE_URL"],
      FULCRUM_INFERENCE_API_KEY: process.env["FULCRUM_INFERENCE_API_KEY"],
    };
  });
  afterEach(() => {
    globalThis.fetch = original;
    for (const [k, v] of Object.entries(origEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("implements InferenceBackend", () => {
    const b = new OpenAICompatibleBackend({
      url: "http://example.com",
      apiKey: "sk-test",
    });
    assertImplementsBackend(b);
    expect(b.id).toBe("openai-compatible");
  });

  it("embed() sends Authorization header", async () => {
    const fn = stubFetch({
      "/v1/embeddings": {
        data: [{ embedding: [0.7, 0.8] }],
        model: "test-model",
      },
    });
    const b = new OpenAICompatibleBackend({
      url: "http://example.com",
      apiKey: "sk-test",
    });
    const res = await b.embed(EMBED_REQ);
    expect(res.vectors).toEqual([[0.7, 0.8]]);
    // verify auth header
    const callInit = (fn as any).mock.calls[0][1] as RequestInit;
    expect((callInit.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer sk-test",
    );
  });

  it("generate() uses chat completions", async () => {
    stubFetch({
      "/v1/chat/completions": {
        choices: [{ message: { content: "openai reply" } }],
        model: "test-model",
        usage: { completion_tokens: 7 },
      },
    });
    const b = new OpenAICompatibleBackend({
      url: "http://example.com",
      apiKey: "sk-test",
    });
    const res = await b.generate(GEN_REQ);
    expect(res.text).toBe("openai reply");
    expect(res.tokens).toBe(7);
  });

  it("reads URL/key from env when not passed", () => {
    process.env["FULCRUM_INFERENCE_URL"] = "http://env.example.com";
    process.env["FULCRUM_INFERENCE_API_KEY"] = "sk-env";
    const b = new OpenAICompatibleBackend();
    expect(b.id).toBe("openai-compatible");
    // no throw = success
  });

  it("health() returns ok", async () => {
    stubFetch({ "/v1/models": { data: [{ id: "gpt-4" }] } });
    const b = new OpenAICompatibleBackend({
      url: "http://example.com",
      apiKey: "sk-test",
    });
    const h = await b.health();
    expect(h.backend).toBe("openai-compatible");
    expect(h.status).toBe("ok");
  });

  it("health() returns down with reason when flag disabled", async () => {
    const b = new OpenAICompatibleBackend({
      url: "http://example.com",
      apiKey: "sk-test",
      flagEnabled: false,
    });
    const h = await b.health();
    expect(h.backend).toBe("openai-compatible");
    expect(h.status).toBe("down");
    expect(h.error).toBe("flag external-llm-provider disabled");
  });

  it("testConnection() returns ok with latency when flag enabled", async () => {
    stubFetch({ "/v1/models": { data: [{ id: "gpt-4" }] } });
    const b = new OpenAICompatibleBackend({
      url: "http://example.com",
      apiKey: "sk-test",
      flagEnabled: true,
    });
    const result = await b.testConnection();
    expect(result.ok).toBe(true);
    expect(typeof result.latency_ms).toBe("number");
  });

  it("testConnection() returns error when flag disabled", async () => {
    const b = new OpenAICompatibleBackend({
      url: "http://example.com",
      apiKey: "sk-test",
      flagEnabled: false,
    });
    const result = await b.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toBe("flag external-llm-provider disabled");
  });

  it("testConnection() returns error when URL not configured", async () => {
    const b = new OpenAICompatibleBackend({
      url: "",
      apiKey: "sk-test",
      flagEnabled: true,
    });
    const result = await b.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toBe("FULCRUM_INFERENCE_URL not configured");
  });

  it("testConnection() returns HTTP error on non-200", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response("Unauthorized", { status: 401 }))) as unknown as typeof fetch;
    const b = new OpenAICompatibleBackend({
      url: "http://example.com",
      apiKey: "bad-key",
      flagEnabled: true,
    });
    const result = await b.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toBe("HTTP 401");
    expect(typeof result.latency_ms).toBe("number");
  });
});
