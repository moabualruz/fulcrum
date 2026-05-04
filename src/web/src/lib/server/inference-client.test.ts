import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

let server: ReturnType<typeof Bun.serve>;
let healthResponse: object = {
  status: "healthy",
  backends: [{ name: "llama-cpp", status: "healthy", models_loaded: 2 }],
  cache: { embed_hit_rate: 0.85, gen_hit_rate: 0.72, db_size_bytes: 1024000 },
};
let modelsResponse: object[] = [
  { id: "phi-3", name: "Phi-3 Mini", size_bytes: 2_000_000_000, downloaded: true, capabilities: ["generate", "embed"] },
  { id: "nomic-embed", name: "Nomic Embed", size_bytes: 500_000_000, downloaded: false, capabilities: ["embed"] },
];
let shouldFail = false;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      if (shouldFail) return new Response("Internal error", { status: 500 });

      if (url.pathname === "/health") {
        return Response.json(healthResponse);
      }
      if (url.pathname === "/models" && req.method === "GET") {
        return Response.json(modelsResponse);
      }
      if (url.pathname === "/backends") {
        return Response.json(healthResponse && "backends" in healthResponse ? (healthResponse as any).backends : []);
      }
      if (url.pathname === "/routing") {
        return Response.json([
          { feature: "embed", backend: "llama-cpp", model: "nomic-embed" },
          { feature: "generate", backend: "llama-cpp", model: "phi-3" },
        ]);
      }
      if (url.pathname === "/embed" && req.method === "POST") {
        return Response.json({ embedding: Array(384).fill(0.1), dimensions: 384, model: "nomic-embed" });
      }
      if (url.pathname === "/generate" && req.method === "POST") {
        return Response.json({ text: "Hello world", tokens_used: 5, model: "phi-3" });
      }
      if (url.pathname === "/classify" && req.method === "POST") {
        return Response.json({ label: "positive", confidence: 0.95, model: "phi-3" });
      }
      if (url.pathname === "/tokenize" && req.method === "POST") {
        return Response.json({ tokens: [1, 2, 3], count: 3, model: "phi-3" });
      }
      if (url.pathname === "/cache/clear" && req.method === "POST") {
        return Response.json({ ok: true });
      }
      if (url.pathname.startsWith("/models/") && req.method === "DELETE") {
        return Response.json({ ok: true });
      }
      if (url.pathname === "/features/external-llm-provider") {
        return Response.json({ enabled: true });
      }
      return new Response("Not found", { status: 404 });
    },
  });

  process.env["FULCRUM_INFERENCE_URL"] = `http://127.0.0.1:${server.port}`;
});

afterEach(() => {
  shouldFail = false;
});

afterAll(() => {
  server.stop(true);
  delete process.env["FULCRUM_INFERENCE_URL"];
});

// Dynamic import so env var is set before module loads
async function loadClient() {
  return import(`./inference-client.ts?cachebust=${Date.now()}`);
}

describe("inference-client", () => {
  test("getHealth returns typed health response", async () => {
    const { getHealth } = await loadClient();
    const health = await getHealth();
    expect(health.status).toBe("healthy");
    expect(health.backends).toHaveLength(1);
    expect(health.cache.embed_hit_rate).toBe(0.85);
  });

  test("listModels returns model array", async () => {
    const { listModels } = await loadClient();
    const models = await listModels();
    expect(models).toHaveLength(2);
    expect(models[0].id).toBe("phi-3");
    expect(models[1].downloaded).toBe(false);
  });

  test("listRouting returns feature routing", async () => {
    const { listRouting } = await loadClient();
    const routes = await listRouting();
    expect(routes).toHaveLength(2);
    expect(routes[0].feature).toBe("embed");
  });

  test("testEmbed returns 384 dimensions", async () => {
    const { testEmbed } = await loadClient();
    const result = await testEmbed("test text");
    expect(result.dimensions).toBe(384);
    expect(result.embedding).toHaveLength(384);
  });

  test("testGenerate returns text", async () => {
    const { testGenerate } = await loadClient();
    const result = await testGenerate("hello");
    expect(result.text).toBe("Hello world");
    expect(result.tokens_used).toBe(5);
  });

  test("testClassify returns label with confidence", async () => {
    const { testClassify } = await loadClient();
    const result = await testClassify("great product");
    expect(result.label).toBe("positive");
    expect(result.confidence).toBe(0.95);
  });

  test("testTokenize returns token count", async () => {
    const { testTokenize } = await loadClient();
    const result = await testTokenize("hello world");
    expect(result.count).toBe(3);
  });

  test("removeModel succeeds without error", async () => {
    const { removeModel } = await loadClient();
    await expect(removeModel("phi-3")).resolves.toBeUndefined();
  });

  test("clearCache succeeds without error", async () => {
    const { clearCache } = await loadClient();
    await expect(clearCache()).resolves.toBeUndefined();
  });

  test("isExternalLlmEnabled returns true when flag set", async () => {
    const { isExternalLlmEnabled } = await loadClient();
    expect(await isExternalLlmEnabled()).toBe(true);
  });

  test("getHealth throws on sidecar error", async () => {
    shouldFail = true;
    const { getHealth } = await loadClient();
    await expect(getHealth()).rejects.toThrow("Sidecar 500");
  });

  test("isExternalLlmEnabled returns false on error", async () => {
    shouldFail = true;
    const { isExternalLlmEnabled } = await loadClient();
    expect(await isExternalLlmEnabled()).toBe(false);
  });
});
