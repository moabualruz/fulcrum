import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import type { InferencePageData } from "./+page.server";

let server: ReturnType<typeof Bun.serve>;
let shouldFail = false;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      if (shouldFail) return new Response("down", { status: 500 });
      if (url.pathname === "/health") {
        return Response.json({
          status: "healthy",
          backends: [{ name: "llama-cpp", status: "healthy", models_loaded: 1 }],
          cache: { embed_hit_rate: 0.9, gen_hit_rate: 0.8, db_size_bytes: 512000 },
        });
      }
      if (url.pathname === "/models") return Response.json([
        { id: "phi-3", name: "Phi-3", size_bytes: 2e9, downloaded: true, capabilities: ["generate"] },
      ]);
      if (url.pathname === "/backends") return Response.json([
        { name: "llama-cpp", status: "healthy", models_loaded: 1 },
      ]);
      if (url.pathname === "/routing") return Response.json([
        { feature: "embed", backend: "llama-cpp", model: "nomic-embed" },
      ]);
      if (url.pathname === "/features/external-llm-provider") return Response.json({ enabled: false });
      return new Response("not found", { status: 404 });
    },
  });
  process.env["FULCRUM_INFERENCE_URL"] = `http://127.0.0.1:${server.port}`;
});

afterEach(() => { shouldFail = false; });
afterAll(() => { server.stop(true); delete process.env["FULCRUM_INFERENCE_URL"]; });

function streamedInference<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { inference?: unknown } }).streamed?.inference;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

describe("/settings/inference +page.server.ts load()", () => {
  test("returns health, models, backends, routing when sidecar up", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      url: new URL("http://localhost/settings/inference"),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const data = await streamedInference<InferencePageData>(result);
    expect(data.error).toBeNull();
    expect(data.health?.status).toBe("healthy");
    expect(data.models).toHaveLength(1);
    expect(data.models[0].id).toBe("phi-3");
    expect(data.backends).toHaveLength(1);
    expect(data.routing).toHaveLength(1);
    expect(data.externalLlmEnabled).toBe(false);
  });

  test("returns error payload when sidecar down", async () => {
    shouldFail = true;
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({
      url: new URL("http://localhost/settings/inference"),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const data = await streamedInference<InferencePageData>(result);
    expect(data.error).toBeTruthy();
    expect(data.health).toBeNull();
    expect(data.models).toEqual([]);
  });

  test("always returns activeProjectId from locals", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load({
      url: new URL("http://localhost/settings/inference"),
      locals: { activeProjectId: "proj-123" },
    } as Parameters<typeof mod.load>[0]);
    expect((result as { activeProjectId: string }).activeProjectId).toBe("proj-123");
  });
});
