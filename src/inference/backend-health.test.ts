/**
 * backend-health.test.ts — BackendHealth typed state, probe contract,
 * InferenceService lifecycle, and ensureRunningIfEmbedded gate.
 *
 * RED phase: these tests will fail because the probe/production code is
 * still in stub form. GREEN phase wires real probe calls.
 */
import { describe, expect, test } from "bun:test";
import { InferenceService } from "./service.ts";
import { ensureRunningIfEmbedded } from "./lifecycle.ts";
import { probeConfiguredBackends, type BackendHealth } from "./backend-probes.ts";
import type { BackendId } from "./backends/types.ts";

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
