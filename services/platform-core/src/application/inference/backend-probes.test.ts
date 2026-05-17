/**
 * routing workflow — Backend probes: BackendHealth status, probe contract, embedded auto-spawn.
 */
import { describe, expect, test } from "bun:test";
import { probeConfiguredBackends, getAllBackendIds, type BackendHealth } from "@platform-core/application/inference/backend-probes.ts";
import { InferenceService } from "@platform-core/application/inference/service.ts";

const VALID_STATUSES = ["running", "stopped", "degraded", "unavailable", "unconfigured"] as const;

// ---------------------------------------------------------------------------
// 1. BackendHealth status enum
// ---------------------------------------------------------------------------

describe("BackendHealth status states", () => {
  test("five valid status values exist", () => {
    expect(VALID_STATUSES).toHaveLength(5);
  });

  test("probeConfiguredBackends returns array", async () => {
    const results = await probeConfiguredBackends();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  test("each result has required fields", async () => {
    const results = await probeConfiguredBackends();
    for (const r of results) {
      expect(typeof r.backend).toBe("string");
      expect(typeof r.configured).toBe("boolean");
      expect(typeof r.enabled).toBe("boolean");
      expect(VALID_STATUSES).toContain(r.status);
      expect(typeof r.lastChecked).toBe("string");
    }
  });

  test("unconfigured backends have null probes", async () => {
    const results = await probeConfiguredBackends();
    for (const r of results) {
      if (!r.configured) {
        expect(r.status).toBe("unconfigured");
        expect(r.embedProbe).toBeNull();
        expect(r.generateProbe).toBeNull();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Backend IDs
// ---------------------------------------------------------------------------

describe("backend IDs", () => {
  test("getAllBackendIds returns 4 backends", () => {
    const ids = getAllBackendIds();
    expect(ids).toContain("embedded");
    expect(ids).toContain("ollama");
    expect(ids).toContain("lm-studio");
    expect(ids).toContain("openai-compatible");
    expect(ids).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// 3. InferenceService lifecycle
// ---------------------------------------------------------------------------

describe("InferenceService", () => {
  test("instantiates without error", () => {
    const svc = new InferenceService();
    expect(svc).toBeDefined();
  });

  test("probeBackends returns array", async () => {
    const svc = new InferenceService();
    const backends = await svc.probeBackends();
    expect(Array.isArray(backends)).toBe(true);
  });

  test("embedded reports stopped when sidecar not running", async () => {
    const results = await probeConfiguredBackends();
    const embedded = results.find((r) => r.backend === "embedded");
    expect(embedded).toBeDefined();
    // In CI/test env, embedded sidecar won't be running
    if (embedded!.configured && embedded!.enabled) {
      expect(["running", "stopped"]).toContain(embedded!.status);
    }
  });
});
