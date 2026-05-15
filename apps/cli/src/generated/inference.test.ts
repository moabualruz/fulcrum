import { afterEach, describe, expect, test } from "bun:test";

import { createInferenceCommand } from "./inference.ts";

const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];
const originalFetch = globalThis.fetch;
const originalLog = console.log;

afterEach(() => {
  restoreEnv("FULCRUM_SERVER_URL", originalServerUrl);
  restoreEnv("FULCRUM_PUBLIC_API_URL", originalPublicApiUrl);
  globalThis.fetch = originalFetch;
  console.log = originalLog;
  process.exitCode = undefined;
});

describe("generated inference commands", () => {
  test("routes generated inference commands through the Nest inference API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    const output: unknown[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      const requestUrl = new URL(String(url));
      calls.push({ url: String(url), method: init?.method, body });
      return Response.json(responseFor(requestUrl.pathname, init?.method ?? "GET", body));
    }) as typeof fetch;

    await createInferenceCommand().parseAsync(["health", "--json"], { from: "user" });
    await createInferenceCommand().parseAsync(["embed", "--text", "hello", "--model", "mini", "--json"], { from: "user" });
    await createInferenceCommand().parseAsync([
      "generate",
      "--prompt",
      "hello",
      "--options-model",
      "mini",
      "--options-max-tokens",
      "12",
      "--options-temperature",
      "0.2",
      "--json",
    ], { from: "user" });
    await createInferenceCommand().parseAsync([
      "classify",
      "--text",
      "bug",
      "--labels",
      "bug,feature",
      "--json",
    ], { from: "user" });
    await createInferenceCommand().parseAsync(["tokenize", "--text", "hello", "--model", "mini", "--json"], {
      from: "user",
    });
    await createInferenceCommand().parseAsync(["models", "list", "--json"], { from: "user" });
    await createInferenceCommand().parseAsync(["models", "pull", "--model-id", "mini", "--force", "--json"], {
      from: "user",
    });
    await createInferenceCommand().parseAsync(["models", "rm", "--model-id", "mini", "--json"], { from: "user" });
    await createInferenceCommand().parseAsync(["backends", "list", "--json"], { from: "user" });
    await createInferenceCommand().parseAsync(["backends", "probe", "--json"], { from: "user" });
    await createInferenceCommand().parseAsync(["config", "get", "--json"], { from: "user" });
    await createInferenceCommand().parseAsync([
      "config",
      "set",
      "--feature",
      "embeddings",
      "--backend",
      "ollama",
      "--json",
    ], { from: "user" });
    await createInferenceCommand().parseAsync([
      "provider",
      "set",
      "--url",
      "https://llm.local",
      "--key",
      "secret",
      "--json",
    ], { from: "user" });
    await createInferenceCommand().parseAsync(["provider", "test", "--json"], { from: "user" });

    expect(calls).toEqual([
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/inference/health",
        body: null,
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/inference/embed",
        body: { texts: ["hello"], model: "mini" },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/inference/generate",
        body: { prompt: "hello", maxTokens: 12, model: "mini", temperature: 0.2 },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/inference/classify",
        body: { text: "bug", labels: ["bug", "feature"] },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/inference/tokenize",
        body: { model: "mini", text: "hello" },
      },
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/inference/models",
        body: null,
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/inference/models/mini/pull",
        body: { force: true },
      },
      {
        method: "DELETE",
        url: "http://127.0.0.1:3210/api/v1/inference/models/mini",
        body: null,
      },
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/inference/backends",
        body: null,
      },
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/inference/backends/probe",
        body: null,
      },
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/inference/config",
        body: null,
      },
      {
        method: "PATCH",
        url: "http://127.0.0.1:3210/api/v1/inference/config",
        body: { feature: "embeddings", backend: "ollama" },
      },
      {
        method: "PATCH",
        url: "http://127.0.0.1:3210/api/v1/inference/provider",
        body: { url: "https://llm.local", key: "secret" },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/inference/provider/test",
        body: null,
      },
    ]);
    expect(output.map((line) => JSON.parse(String(line)))).toEqual([
      { status: "ok", backends: ["embedded"], models: ["mini"] },
      { vectors: [[1, 2]], model: "mini", cached: false, dimensions: 2 },
      { text: "done", model: "mini", tokens: 1 },
      [{ label: "bug", score: 0.9 }],
      { count: 1, tokens: ["hello"] },
      [{ id: "mini", kind: "embed", downloaded: true, active: true }],
      [{ pct: 100, downloaded: 4, total: 4 }],
      { ok: true },
      [{ id: "embedded", available: true, active: true, reason: null }],
      [{ backend: "embedded", configured: true, enabled: true, status: "running", reason: null }],
      { embeddings: "embedded" },
      { ok: true, config: { embeddings: "ollama" } },
      { ok: true, url: "https://llm.local" },
      { ok: true, latency_ms: 5 },
    ]);
  });

  test("streams model pull events as JSON lines when watch is requested", async () => {
    process.env["FULCRUM_PUBLIC_API_URL"] = "http://127.0.0.1:3210";
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async () =>
      Response.json([
        { pct: 25, downloaded: 1, total: 4 },
        { pct: 100, downloaded: 4, total: 4 },
      ])) as unknown as typeof fetch;

    await createInferenceCommand().parseAsync(["models", "pull", "--model-id", "mini", "--watch"], {
      from: "user",
    });

    expect(output.map((line) => JSON.parse(line))).toEqual([
      { pct: 25, downloaded: 1, total: 4 },
      { pct: 100, downloaded: 4, total: 4 },
    ]);
  });
});

function responseFor(path: string, method: string, body: unknown): unknown {
  if (path === "/api/v1/inference/health") return { status: "ok", backends: ["embedded"], models: ["mini"] };
  if (path === "/api/v1/inference/embed" && method === "POST") {
    return { vectors: [[1, 2]], model: (body as { model?: string } | null)?.model ?? "mini", cached: false, dimensions: 2 };
  }
  if (path === "/api/v1/inference/generate" && method === "POST") return { text: "done", model: "mini", tokens: 1 };
  if (path === "/api/v1/inference/classify" && method === "POST") return [{ label: "bug", score: 0.9 }];
  if (path === "/api/v1/inference/tokenize" && method === "POST") return { count: 1, tokens: ["hello"] };
  if (path === "/api/v1/inference/models" && method === "GET") {
    return [{ id: "mini", kind: "embed", downloaded: true, active: true }];
  }
  if (path === "/api/v1/inference/models/mini/pull" && method === "POST") return [{ pct: 100, downloaded: 4, total: 4 }];
  if (path === "/api/v1/inference/models/mini" && method === "DELETE") return { ok: true };
  if (path === "/api/v1/inference/backends") return [{ id: "embedded", available: true, active: true, reason: null }];
  if (path === "/api/v1/inference/backends/probe") {
    return [{ backend: "embedded", configured: true, enabled: true, status: "running", reason: null }];
  }
  if (path === "/api/v1/inference/config" && method === "GET") return { embeddings: "embedded" };
  if (path === "/api/v1/inference/config" && method === "PATCH") return { ok: true, config: { embeddings: "ollama" } };
  if (path === "/api/v1/inference/provider" && method === "PATCH") return { ok: true, url: "https://llm.local" };
  if (path === "/api/v1/inference/provider/test" && method === "POST") return { ok: true, latency_ms: 5 };
  throw new Error(`unexpected request ${method} ${path}`);
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
