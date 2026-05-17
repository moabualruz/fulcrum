import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { TaskFacts, RoutingDecision } from "./types.ts";
import {
  llmFallback,
  configureLlmFallback,
  parseBackendSpec,
  type LlmFallbackConfig,
  type SidecarClient,
} from "./llm-fallback.ts";

const TASK_FACTS: TaskFacts = {
  task: {
    kind: "bug",
    priority: "high",
    tags: ["backend"],
    title: "Fix router assignment",
  },
};

const ORG_ID = "00000000-0000-4000-8000-000000000001";

function mockSidecar(response: unknown, healthy = true): SidecarClient {
  return {
    healthCheck: async () => healthy,
    classify: async () => response,
  };
}

describe("llmFallback", () => {
  let previousFeatures: string | undefined;

  beforeEach(() => {
    previousFeatures = process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FEATURES"] = "router-llm";
  });

  afterEach(() => {
    if (previousFeatures === undefined) {
      delete process.env["FULCRUM_FEATURES"];
    } else {
      process.env["FULCRUM_FEATURES"] = previousFeatures;
    }
    configureLlmFallback({ sidecarClient: null });
  });

  it("returns RoutingDecision with source='llm-fallback' when sidecar returns valid response", async () => {
    configureLlmFallback({
      sidecarClient: mockSidecar({ agent: "codex", confidence: 0.85, reasoning: "bug task" }),
    });

    const result = await llmFallback(TASK_FACTS, ORG_ID);
    expect(result).toEqual({
      ruleId: null,
      source: "llm-fallback",
      agent: "codex",
      confidence: 0.85,
    });
  });

  it("returns null when feature flag is OFF", async () => {
    delete process.env["FULCRUM_FEATURES"];
    configureLlmFallback({
      sidecarClient: mockSidecar({ agent: "codex", confidence: 0.9, reasoning: "test" }),
    });

    const result = await llmFallback(TASK_FACTS, ORG_ID);
    expect(result).toBeNull();
  });

  it("returns null when sidecar health check fails", async () => {
    const warnSpy = mock(() => {});
    const origWarn = console.warn;
    console.warn = warnSpy;

    configureLlmFallback({
      sidecarClient: mockSidecar({ agent: "codex", confidence: 0.9, reasoning: "test" }, false),
    });

    const result = await llmFallback(TASK_FACTS, ORG_ID);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();

    console.warn = origWarn;
  });

  it("returns null when sidecar returns invalid structured output", async () => {
    configureLlmFallback({
      sidecarClient: mockSidecar({ wrong: "shape" }),
    });

    const result = await llmFallback(TASK_FACTS, ORG_ID);
    expect(result).toBeNull();
  });

  it("returns null when sidecar throws (timeout/error)", async () => {
    configureLlmFallback({
      sidecarClient: {
        healthCheck: async () => true,
        classify: async () => { throw new Error("connection refused"); },
      },
    });

    const result = await llmFallback(TASK_FACTS, ORG_ID);
    expect(result).toBeNull();
  });

  it("sidecar mock is never called when flag is OFF", async () => {
    delete process.env["FULCRUM_FEATURES"];
    let classifyCalled = false;
    configureLlmFallback({
      sidecarClient: {
        healthCheck: async () => { classifyCalled = true; return true; },
        classify: async () => { classifyCalled = true; return {}; },
      },
    });

    await llmFallback(TASK_FACTS, ORG_ID);
    expect(classifyCalled).toBe(false);
  });

  it("supports backend=ollama via feature flag suffix", async () => {
    process.env["FULCRUM_FEATURES"] = "router-llm:ollama";
    const spec = parseBackendSpec();
    expect(spec).toEqual({ backend: "ollama", url: undefined, key: undefined });
  });

  it("supports backend=openai-compatible with url and key", async () => {
    process.env["FULCRUM_FEATURES"] = "router-llm:openai-compatible:http://localhost:8080:sk-test";
    const spec = parseBackendSpec();
    expect(spec).toEqual({
      backend: "openai-compatible",
      url: "http://localhost:8080",
      key: "sk-test",
    });
  });

  it("defaults backend to embedded", async () => {
    process.env["FULCRUM_FEATURES"] = "router-llm";
    const spec = parseBackendSpec();
    expect(spec).toEqual({ backend: "embedded", url: undefined, key: undefined });
  });

  it("returns null when flag is present among other features", async () => {
    process.env["FULCRUM_FEATURES"] = "other-feature,router-llm:lm-studio,another";
    configureLlmFallback({
      sidecarClient: mockSidecar({ agent: "codex", confidence: 0.7, reasoning: "test" }),
    });

    const result = await llmFallback(TASK_FACTS, ORG_ID);
    expect(result).toEqual({
      ruleId: null,
      source: "llm-fallback",
      agent: "codex",
      confidence: 0.7,
    });
  });
});
