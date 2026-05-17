import { afterEach, describe, expect, test } from "bun:test";

import type { InferencePageData } from "./+page.server";

const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];

interface CapturedRequest {
  path: string;
  method: string;
  body: unknown;
  cookie: string | null;
}

afterEach(() => {
  restoreEnv("FULCRUM_SERVER_URL", originalServerUrl);
  restoreEnv("FULCRUM_PUBLIC_API_URL", originalPublicApiUrl);
});

function streamedInference<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { inference?: unknown } }).streamed?.inference;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

function createInferenceFetch(options: { fail?: boolean } = {}): {
  fetch: typeof fetch;
  requests: CapturedRequest[];
} {
  const requests: CapturedRequest[] = [];
  return {
    requests,
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      const headers = new Headers(init?.headers);
      requests.push({
        path: url.pathname,
        method: init?.method ?? "GET",
        body,
        cookie: headers.get("cookie"),
      });

      if (options.fail) {
        return Response.json({ message: "Inference API down" }, { status: 503 });
      }

      if (url.pathname === "/api/v1/inference/health") {
        return Response.json({
          status: "ok",
          backends: ["embedded"],
          models: ["phi-3"],
        });
      }
      if (url.pathname === "/api/v1/inference/models") {
        return Response.json([
          {
            id: "phi-3",
            kind: "generate",
            downloaded: true,
            active: true,
            sizeBytes: 2_000_000_000,
          },
        ]);
      }
      if (url.pathname === "/api/v1/inference/backends") {
        return Response.json([
          { id: "embedded", available: true, active: true, reason: null },
          {
            id: "openai-compatible",
            available: false,
            active: false,
            reason: "flag disabled",
          },
        ]);
      }
      if (url.pathname === "/api/v1/inference/config") {
        return Response.json({
          embeddings: "embedded",
          "router-llm": "embedded",
        });
      }
      if (url.pathname === "/api/v1/inference/embed" && init?.method === "POST") {
        return Response.json({
          vectors: [[1, 2, 3, 4]],
          dimensions: 4,
          model: "mini-embed",
          cached: false,
        });
      }
      if (url.pathname === "/api/v1/inference/generate" && init?.method === "POST") {
        return Response.json({
          text: "generated",
          tokens: 3,
          model: "mini-generate",
        });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch,
  };
}

function loadEvent(fetchFn: typeof fetch, cookie = "fulcrum_session=abc") {
  return {
    url: new URL("http://fulcrum.local/settings/inference"),
    fetch: fetchFn,
    request: new Request("http://fulcrum.local/settings/inference", {
      headers: { cookie },
    }),
    locals: { activeProjectId: null },
  };
}

function actionEvent(fetchFn: typeof fetch, form: FormData) {
  return {
    url: new URL("http://fulcrum.local/settings/inference"),
    fetch: fetchFn,
    request: new Request("http://fulcrum.local/settings/inference", {
      method: "POST",
      headers: { cookie: "fulcrum_session=abc" },
      body: form,
    }),
    locals: { activeProjectId: null },
  };
}

describe("/settings/inference +page.server.ts", () => {
  test("loads health, models, backends, and routing through the Nest public API", async () => {
    const { fetch, requests } = createInferenceFetch();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);

    const result = await mod.load(loadEvent(fetch));
    const data = await streamedInference<InferencePageData>(result);

    expect(data.error).toBeNull();
    expect(data.health?.status).toBe("healthy");
    expect(data.models).toHaveLength(1);
    expect(data.models[0]).toMatchObject({
      id: "phi-3",
      name: "phi-3",
      size_bytes: 2_000_000_000,
      downloaded: true,
      capabilities: ["generate"],
    });
    expect(data.backends).toEqual([
      { name: "embedded", status: "healthy", models_loaded: 1 },
      { name: "openai-compatible", status: "unreachable", models_loaded: 0 },
    ]);
    expect(data.routing).toEqual([
      { feature: "embeddings", backend: "embedded", model: "embedded" },
      { feature: "router-llm", backend: "embedded", model: "embedded" },
    ]);
    expect(data.externalLlmEnabled).toBe(false);
    expect(requests.map((request) => request.path)).toEqual([
      "/api/v1/inference/health",
      "/api/v1/inference/models",
      "/api/v1/inference/backends",
      "/api/v1/inference/config",
    ]);
    expect(requests.every((request) => request.cookie === "fulcrum_session=abc")).toBe(true);
  });

  test("returns an error payload when the public API is unreachable", async () => {
    const { fetch } = createInferenceFetch({ fail: true });
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);

    const result = await mod.load(loadEvent(fetch));
    const data = await streamedInference<InferencePageData>(result);

    expect(data.error).toBe("Inference API down");
    expect(data.health).toBeNull();
    expect(data.models).toEqual([]);
  });

  test("always returns activeProjectId from locals", async () => {
    const { fetch } = createInferenceFetch();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load({
      ...loadEvent(fetch),
      locals: { activeProjectId: "proj-123" },
    });

    expect((result as { activeProjectId: string }).activeProjectId).toBe("proj-123");
  });

  test("testEmbed posts through the Nest public API", async () => {
    const { fetch, requests } = createInferenceFetch();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const form = new FormData();
    form.set("text", "embed this");

    const result = await mod.actions.testEmbed(actionEvent(fetch, form));

    expect(result).toEqual({
      success: true,
      dimensions: 4,
      preview: [1, 2, 3, 4],
      model: "mini-embed",
      cached: false,
    });
    expect(requests.at(-1)).toMatchObject({
      path: "/api/v1/inference/embed",
      method: "POST",
      body: { texts: ["embed this"] },
      cookie: "fulcrum_session=abc",
    });
  });

  test("testGenerate posts through the Nest public API with options", async () => {
    const { fetch, requests } = createInferenceFetch();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    const form = new FormData();
    form.set("prompt", "generate this");
    form.set("maxTokens", "12");
    form.set("schema", "{\"type\":\"object\"}");

    const result = await mod.actions.testGenerate(actionEvent(fetch, form));

    expect(result).toEqual({
      success: true,
      generateText: "generated",
      text: "generated",
      tokens: 3,
      model: "mini-generate",
      schemaValid: true,
    });
    expect(requests.at(-1)).toMatchObject({
      path: "/api/v1/inference/generate",
      method: "POST",
      body: {
        prompt: "generate this",
        maxTokens: 12,
        schema: { type: "object" },
      },
      cookie: "fulcrum_session=abc",
    });
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
