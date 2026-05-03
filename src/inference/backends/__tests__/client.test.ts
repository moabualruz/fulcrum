import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { InferenceClient } from "../client.ts";
import type { BackendId } from "../types.ts";

describe("InferenceClient", () => {
  let origEnv: Record<string, string | undefined>;

  beforeEach(() => {
    origEnv = {
      FULCRUM_INFERENCE_BACKEND: process.env["FULCRUM_INFERENCE_BACKEND"],
      FULCRUM_FEATURES: process.env["FULCRUM_FEATURES"],
      FULCRUM_INFERENCE_URL: process.env["FULCRUM_INFERENCE_URL"],
      FULCRUM_INFERENCE_API_KEY: process.env["FULCRUM_INFERENCE_API_KEY"],
    };
    // clean slate
    delete process.env["FULCRUM_INFERENCE_BACKEND"];
    delete process.env["FULCRUM_FEATURES"];
    delete process.env["FULCRUM_INFERENCE_URL"];
    delete process.env["FULCRUM_INFERENCE_API_KEY"];
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(origEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("defaults to embedded when no env set", () => {
    const c = new InferenceClient();
    expect(c.resolveBackendId()).toBe("embedded");
  });

  it("reads FULCRUM_INFERENCE_BACKEND=ollama", () => {
    process.env["FULCRUM_INFERENCE_BACKEND"] = "ollama";
    const c = new InferenceClient();
    expect(c.resolveBackendId()).toBe("ollama");
  });

  it("per-feature qualifier overrides global default", () => {
    process.env["FULCRUM_INFERENCE_BACKEND"] = "embedded";
    process.env["FULCRUM_FEATURES"] = "embeddings:ollama,router-llm:embedded";
    const c = new InferenceClient();
    expect(c.resolveBackendId("embeddings")).toBe("ollama");
    expect(c.resolveBackendId("router-llm")).toBe("embedded");
    // unqualified feature falls back to global
    expect(c.resolveBackendId("classify")).toBe("embedded");
  });

  it("resolveBackend() returns correct backend instance", () => {
    process.env["FULCRUM_INFERENCE_BACKEND"] = "ollama";
    const c = new InferenceClient();
    const b = c.resolveBackend();
    expect(b.id).toBe("ollama");
  });

  it("resolveBackend() with feature qualifier", () => {
    process.env["FULCRUM_FEATURES"] = "embeddings:ollama";
    const c = new InferenceClient();
    const b = c.resolveBackend("embeddings");
    expect(b.id).toBe("ollama");
  });

  it("isEnabled() gates ollama backend", () => {
    const c = new InferenceClient();
    // ollama not enabled by default — only when FULCRUM_FEATURES includes it or backend=ollama
    expect(c.isEnabled("ollama")).toBe(false);
    process.env["FULCRUM_FEATURES"] = "embeddings:ollama";
    const c2 = new InferenceClient();
    expect(c2.isEnabled("ollama")).toBe(true);
  });

  it("isEnabled() gates external-llm-provider for openai-compatible", () => {
    const c = new InferenceClient();
    expect(c.isEnabled("openai-compatible")).toBe(false);
    process.env["FULCRUM_FEATURES"] = "external-llm-provider";
    process.env["FULCRUM_INFERENCE_URL"] = "http://example.com";
    process.env["FULCRUM_INFERENCE_API_KEY"] = "sk-test";
    const c2 = new InferenceClient();
    expect(c2.isEnabled("openai-compatible")).toBe(true);
  });

  it("isEnabled() embedded always true", () => {
    const c = new InferenceClient();
    expect(c.isEnabled("embedded")).toBe(true);
  });

  it("listBackends() returns all with availability", () => {
    const c = new InferenceClient();
    const list = c.listBackends();
    expect(list).toHaveLength(4);
    const embedded = list.find((b) => b.id === "embedded");
    expect(embedded?.available).toBe(true);
    const ollama = list.find((b) => b.id === "ollama");
    expect(ollama?.available).toBe(false);
  });

  it("FULCRUM_INFERENCE_BACKEND=ollama enables ollama", () => {
    process.env["FULCRUM_INFERENCE_BACKEND"] = "ollama";
    const c = new InferenceClient();
    expect(c.isEnabled("ollama")).toBe(true);
  });
});
