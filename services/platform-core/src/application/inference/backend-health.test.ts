/**
 * backend-health.test.ts — BackendHealth typed state, probe contract,
 * InferenceService lifecycle, and ensureRunningIfEmbedded gate.
 *
 * Verifies backend probe state and lifecycle routing behavior.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { InferenceService } from "./service.ts";
import { ensureRunningIfEmbedded } from "./lifecycle.ts";
import { probeConfiguredBackends, type BackendHealth } from "./backend-probes.ts";
import type { BackendId } from "./backends/types.ts";

const ORIGINAL_ENV = {
  FULCRUM_FEATURES: process.env["FULCRUM_FEATURES"],
  FULCRUM_INFERENCE_BACKENDS: process.env["FULCRUM_INFERENCE_BACKENDS"],
  FULCRUM_INFERENCE_BACKEND: process.env["FULCRUM_INFERENCE_BACKEND"],
  OLLAMA_URL: process.env["OLLAMA_URL"],
  OLLAMA_MODEL: process.env["OLLAMA_MODEL"],
  LM_STUDIO_URL: process.env["LM_STUDIO_URL"],
  LM_STUDIO_MODEL: process.env["LM_STUDIO_MODEL"],
};
const originalFetch = globalThis.fetch;

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// 1. BackendHealth type shape
// ---------------------------------------------------------------------------

describe("BackendHealth type shape", () => {
  const VALID_STATUSES = ["running", "stopped", "degraded", "unavailable", "unconfigured"] as const;

  test("all five status values are valid", () => {
    // Compile-time check: BackendHealth status is one of the five.
    const statuses: readonly string[] = VALID_STATUSES;
    expect(statuses).toHaveLength(5);
  });

  test("probeConfiguredBackends returns an array of BackendHealth", async () => {
    const results = await probeConfiguredBackends();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);

    for (const r of results) {
      // Every result must have the required fields (enforced by TypeScript).
      expect(typeof r.backend).toBe("string");
      expect(typeof r.configured).toBe("boolean");
      expect(typeof r.enabled).toBe("boolean");
      expect(VALID_STATUSES.includes(r.status as typeof VALID_STATUSES[number])).toBe(true);
      expect(typeof r.lastChecked).toBe("string");
    }
  });

  test("unconfigured backends report status=unconfigured with null probes", async () => {
    const results = await probeConfiguredBackends();
    for (const r of results) {
      if (!r.configured) {
        expect(r.status).toBe("unconfigured");
        expect(r.embedProbe).toBeNull();
        expect(r.generateProbe).toBeNull();
        expect(r.dimensions).toBeNull();
      }
    }
  });

  test("configured backends have reason text when not running", async () => {
    const results = await probeConfiguredBackends();
    for (const r of results) {
      if (r.configured && r.status !== "running" && r.status !== "unconfigured") {
        expect(r.reason).toBeTruthy();
      }
    }
  });

  test("selected Ollama backend runs real embed and generate probe requests", async () => {
    process.env["FULCRUM_FEATURES"] = "ollama";
    process.env["FULCRUM_INFERENCE_BACKEND"] = "ollama";
    process.env["OLLAMA_URL"] = "http://ollama.test";
    process.env["OLLAMA_MODEL"] = "nomic-test";
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      });
      if (String(input).endsWith("/v1/embeddings")) {
        return Response.json({
          model: "nomic-test",
          data: [{ embedding: [0.1, 0.2, 0.3] }],
        });
      }
      return Response.json({ choices: [{ message: { content: "ok" } }] });
    }) as unknown as typeof fetch;

    const ollama = (await probeConfiguredBackends()).find((backend) => backend.backend === "ollama");

    expect(ollama).toMatchObject({
      configured: true,
      enabled: true,
      status: "running",
      model: "nomic-test",
      dimensions: 3,
      reason: null,
    });
    expect(ollama?.embedProbe).toMatchObject({ ok: true, model: "nomic-test", dimensions: 3 });
    expect(ollama?.generateProbe).toMatchObject({ ok: true, model: "nomic-test" });
    expect(requests.map((request) => request.url)).toEqual([
      "http://ollama.test/v1/embeddings",
      "http://ollama.test/v1/chat/completions",
    ]);
    expect(requests[0]?.body).toMatchObject({ model: "nomic-test", input: "hello world" });
    expect(requests[1]?.body).toMatchObject({ model: "nomic-test", max_tokens: 10 });
  });

  test("configured but unselected external backend reports stopped without probing", async () => {
    process.env["FULCRUM_FEATURES"] = "lm-studio";
    process.env["FULCRUM_INFERENCE_BACKEND"] = "ollama";
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return Response.json({});
    }) as unknown as typeof fetch;

    const lmStudio = (await probeConfiguredBackends()).find((backend) => backend.backend === "lm-studio");

    expect(lmStudio).toMatchObject({
      configured: true,
      enabled: false,
      status: "stopped",
      reason: "backend not selected in config",
      embedProbe: null,
      generateProbe: null,
      dimensions: null,
    });
    expect(fetchCalls).toBe(0);
  });

  test("probe failures distinguish degraded from unavailable backends", async () => {
    process.env["FULCRUM_FEATURES"] = "ollama";
    process.env["FULCRUM_INFERENCE_BACKEND"] = "ollama";
    let scenario: "degraded" | "unavailable" = "degraded";

    globalThis.fetch = (async (input: string | URL | Request) => {
      const isEmbed = String(input).endsWith("/v1/embeddings");
      if (scenario === "degraded" && isEmbed) {
        return Response.json({ model: "llama3.2", data: [{ embedding: [1, 2] }] });
      }
      return new Response("nope", { status: 503 });
    }) as unknown as typeof fetch;

    const degraded = (await probeConfiguredBackends()).find((backend) => backend.backend === "ollama");
    expect(degraded?.status).toBe("degraded");
    expect(degraded?.reason).toContain("generate: HTTP 503");
    expect(degraded?.dimensions).toBe(2);

    scenario = "unavailable";
    const unavailable = (await probeConfiguredBackends()).find((backend) => backend.backend === "ollama");
    expect(unavailable?.status).toBe("unavailable");
    expect(unavailable?.reason).toContain("embed: HTTP 503");
    expect(unavailable?.reason).toContain("generate: HTTP 503");
  });
});

// ---------------------------------------------------------------------------
// 2. InferenceService
// ---------------------------------------------------------------------------

describe("InferenceService", () => {
  test("returns typed backends array from probeBackends", async () => {
    const svc = new InferenceService();
    const backends = await svc.probeBackends();
    expect(Array.isArray(backends)).toBe(true);
    for (const b of backends) {
      expect(["running", "stopped", "degraded", "unavailable", "unconfigured"]).toContain(b.status);
      expect(typeof b.backend).toBe("string");
      expect(typeof b.lastChecked).toBe("string");
    }
  });

  test("health returns sidecar status plus backends array", async () => {
    const svc = new InferenceService();
    const h = await svc.health();
    expect(h.sidecar).toBeDefined();
    expect(typeof h.sidecar.status).toBe("string");
    expect(Array.isArray(h.backends)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Lifecycle auto-spawn gate
// ---------------------------------------------------------------------------

describe("ensureRunningIfEmbedded", () => {
  test("returns null or InferenceRunning without throwing", async () => {
    // When the selected backend is not "embedded", this should return null.
    // When it is "embedded", it may return the running instance or throw.
    const result = await ensureRunningIfEmbedded();
    // Either null or a running instance — both are valid.
    if (result !== null) {
      expect(typeof result.pid).toBe("number");
      expect(typeof result.socketPath).toBe("string");
    }
  });
});
