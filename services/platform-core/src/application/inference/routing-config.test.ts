import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  getRoutingConfig,
  setRoutingConfig,
  resetRoutingConfig,
  selectBackend,
  replaceRoutingConfig,
} from "./routing-config.ts";

describe("routing-config", () => {
  let origEnv: Record<string, string | undefined>;

  beforeEach(() => {
    origEnv = {
      FULCRUM_INFERENCE_BACKEND: process.env["FULCRUM_INFERENCE_BACKEND"],
      FULCRUM_FEATURES: process.env["FULCRUM_FEATURES"],
    };
    delete process.env["FULCRUM_INFERENCE_BACKEND"];
    delete process.env["FULCRUM_FEATURES"];
    resetRoutingConfig();
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(origEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetRoutingConfig();
  });

  it("seeds defaults from DEFAULT_FEATURE_BACKEND_MAP", () => {
    const map = getRoutingConfig();
    expect(map.embeddings).toBe("embedded");
    expect(map["router-llm"]).toBe("embedded");
    expect(map["memory-llm-extract"]).toBe("embedded");
  });

  it("seeds from FULCRUM_FEATURES env", () => {
    process.env["FULCRUM_FEATURES"] = "embeddings:ollama,router-llm:lm-studio";
    resetRoutingConfig();
    const map = getRoutingConfig();
    expect(map.embeddings).toBe("ollama");
    expect(map["router-llm"]).toBe("lm-studio");
  });

  it("setRoutingConfig mutates in place without restart", () => {
    const map1 = getRoutingConfig();
    expect(map1.embeddings).toBe("embedded");
    setRoutingConfig("embeddings", "ollama");
    const map2 = getRoutingConfig();
    expect(map2.embeddings).toBe("ollama");
  });

  it("selectBackend returns explicit map entry over env", () => {
    process.env["FULCRUM_INFERENCE_BACKEND"] = "lm-studio";
    replaceRoutingConfig({ embeddings: "ollama" });
    expect(selectBackend("embeddings")).toBe("ollama");
  });

  it("selectBackend falls back to env when feature not in map", () => {
    process.env["FULCRUM_INFERENCE_BACKEND"] = "lm-studio";
    replaceRoutingConfig({});
    expect(selectBackend("classify")).toBe("lm-studio");
  });

  it("selectBackend falls back to embedded when no env set", () => {
    replaceRoutingConfig({});
    expect(selectBackend("classify")).toBe("embedded");
  });

  it("selectBackend with no feature returns env or embedded", () => {
    expect(selectBackend()).toBe("embedded");
    process.env["FULCRUM_INFERENCE_BACKEND"] = "ollama";
    expect(selectBackend()).toBe("ollama");
  });

  it("config changes take effect on next selectBackend call", () => {
    expect(selectBackend("embeddings")).toBe("embedded");
    setRoutingConfig("embeddings", "ollama");
    expect(selectBackend("embeddings")).toBe("ollama");
    setRoutingConfig("embeddings", "embedded");
    expect(selectBackend("embeddings")).toBe("embedded");
  });
});
