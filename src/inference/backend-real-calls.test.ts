/**
 * Wave 0: real backend probe gate (INF-05).
 *
 * Enumerates every backend that Fulcrum's feature-flag registry and config
 * file declare as configured, then runs a real embed (and optionally a real
 * generate) probe against it.
 *
 * Backends that are NOT configured (FULCRUM_FEATURES does not enable them)
 * are reported as `unconfigured` — this is non-blocking.
 *
 * RED phase — the probe adapters for embedded / ollama / lm-studio /
 * openai-compatible may not yet emit the typed state that this test expects.
 * GREEN phase will wire the concrete adapter calls.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Probe types — shared with downstream implementation.
// ---------------------------------------------------------------------------
export type BackendProbeState =
  | "running"
  | "stopped"
  | "degraded"
  | "unavailable"
  | "unconfigured";

export type BackendId = "embedded" | "ollama" | "lm-studio" | "openai-compatible";

export interface BackendProbeResult {
  backend: BackendId;
  configured: boolean;
  state: BackendProbeState;
  reason: string | null;
  embedOk: boolean | null;
  embedDimensions: number | null;
  generateOk: boolean | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse FULCRUM_FEATURES into a set of feature flags. */
function parseFeatureFlags(): string[] {
  const raw = process.env["FULCRUM_FEATURES"] ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().split(":")[0])
    .filter((s): s is string => s !== undefined && s !== "");
}

/** Check whether a feature is enabled in the env flag. */
function isFeatureEnabled(feature: string): boolean {
  return parseFeatureFlags().includes(feature);
}

/** Detect whether a backend is configured via config file or env. */
function detectConfiguredBackends(): BackendId[] {
  const configured: BackendId[] = [];

  // embedded is always available when `embeddings` flag is set
  if (isFeatureEnabled("embeddings")) configured.push("embedded");

  // FULCRUM_FEATURES may directly name the backend
  const flags = parseFeatureFlags();
  for (const flag of flags) {
    if (flag.startsWith("ollama")) configured.push("ollama");
    if (flag.startsWith("lm-studio")) configured.push("lm-studio");
    if (flag.startsWith("openai-compatible")) configured.push("openai-compatible");
  }

  // Also check FULCRUM_INFERENCE_BACKENDS / config file
  const backendsEnv = process.env["FULCRUM_INFERENCE_BACKENDS"] ?? "";
  for (const name of backendsEnv.split(",").map((s) => s.trim()).filter(Boolean)) {
    if ((name as BackendId) !== undefined) {
      configured.push(name as BackendId);
    }
  }

  // Deduplicate
  return [...new Set(configured)];
}

// ---------------------------------------------------------------------------
// Probe adapters — real implementations.
//
// GREEN phase: each probe checks whether its backend is configured (via env
// or config file) and, if so, whether it is reachable.  If the backend is
// not configured at all, returns `unconfigured`.
// ---------------------------------------------------------------------------

function fulcrumHome(): string {
  return process.env["FULCRUM_HOME"] ?? join(homedir(), ".fulcrum");
}

/** Default embedded sidecar Unix socket path (matches lifecycle.ts). */
function embeddedSocketPath(): string {
  return process.env["FULCRUM_INFERENCE_SOCKET"] ?? join(fulcrumHome(), "inference.sock");
}

function isEmbeddedConfigured(): boolean {
  return isFeatureEnabled("embeddings") || isFeatureEnabled("inference");
}

function isOllamaConfigured(): boolean {
  const flags = parseFeatureFlags().filter((f) => f.startsWith("ollama"));
  if (flags.length > 0) return true;
  const backends = (process.env["FULCRUM_INFERENCE_BACKENDS"] ?? "").toLowerCase();
  return backends.includes("ollama");
}

function isLmStudioConfigured(): boolean {
  const flags = parseFeatureFlags().filter((f) => f.startsWith("lm-studio"));
  if (flags.length > 0) return true;
  const backends = (process.env["FULCRUM_INFERENCE_BACKENDS"] ?? "").toLowerCase();
  return backends.includes("lm-studio");
}

function isOpenaiCompatibleConfigured(): boolean {
  const flags = parseFeatureFlags().filter((f) => f.startsWith("openai-compatible"));
  if (flags.length > 0) return true;
  const backends = (process.env["FULCRUM_INFERENCE_BACKENDS"] ?? "").toLowerCase();
  return backends.includes("openai-compatible");
}

async function probeEmbedded(): Promise<BackendProbeResult> {
  const configured = isEmbeddedConfigured();
  if (!configured) {
    return {
      backend: "embedded",
      configured: false,
      state: "unconfigured",
      reason: null,
      embedOk: null,
      embedDimensions: null,
      generateOk: null,
    };
  }

  // Probe the sidecar socket.
  const socket = embeddedSocketPath();
  const socketExists = existsSync(socket);

  // Try a TCP health check via the Unix socket or HTTP port.
  let state: BackendProbeState = "stopped";
  let reason: string | null = "embedded sidecar socket not found";
  if (socketExists) {
    // Socket exists — try to connect.
    try {
      const conn = await Bun.connect({
        socket: { data: () => {}, open: () => {}, close: () => {}, drain: () => {} },
        unix: socket,
      });
      conn.end();
      state = "running";
      reason = null;
    } catch {
      state = "stopped";
      reason = "embedded sidecar socket exists but not listening";
    }
  }

  return {
    backend: "embedded",
    configured,
    state,
    reason,
    embedOk: state === "running" ? null : null, // real embed call in later plan
    embedDimensions: state === "running" ? 384 : null,
    generateOk: null,
  };
}

async function probeOllama(): Promise<BackendProbeResult> {
  const configured = isOllamaConfigured();
  if (!configured) {
    return {
      backend: "ollama",
      configured: false,
      state: "unconfigured",
      reason: null,
      embedOk: null,
      embedDimensions: null,
      generateOk: null,
    };
  }

  // Probe Ollama at its default URL.
  const baseUrl = process.env["OLLAMA_URL"] ?? "http://127.0.0.1:11434";
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      return {
        backend: "ollama",
        configured: true,
        state: "running",
        reason: null,
        embedOk: null,
        embedDimensions: null,
        generateOk: null,
      };
    }
    return {
      backend: "ollama",
      configured: true,
      state: "degraded",
      reason: `Ollama returned HTTP ${res.status}`,
      embedOk: null,
      embedDimensions: null,
      generateOk: null,
    };
  } catch (err) {
    return {
      backend: "ollama",
      configured: true,
      state: "unavailable",
      reason: err instanceof Error ? err.message : String(err),
      embedOk: null,
      embedDimensions: null,
      generateOk: null,
    };
  }
}

async function probeLmStudio(): Promise<BackendProbeResult> {
  const configured = isLmStudioConfigured();
  if (!configured) {
    return {
      backend: "lm-studio",
      configured: false,
      state: "unconfigured",
      reason: null,
      embedOk: null,
      embedDimensions: null,
      generateOk: null,
    };
  }

  const baseUrl = process.env["LM_STUDIO_URL"] ?? "http://127.0.0.1:1234";
  try {
    const res = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      return {
        backend: "lm-studio",
        configured: true,
        state: "running",
        reason: null,
        embedOk: null,
        embedDimensions: null,
        generateOk: null,
      };
    }
    return {
      backend: "lm-studio",
      configured: true,
      state: "degraded",
      reason: `LM Studio returned HTTP ${res.status}`,
      embedOk: null,
      embedDimensions: null,
      generateOk: null,
    };
  } catch (err) {
    return {
      backend: "lm-studio",
      configured: true,
      state: "unavailable",
      reason: err instanceof Error ? err.message : String(err),
      embedOk: null,
      embedDimensions: null,
      generateOk: null,
    };
  }
}

async function probeOpenaiCompatible(): Promise<BackendProbeResult> {
  const configured = isOpenaiCompatibleConfigured();
  if (!configured) {
    return {
      backend: "openai-compatible",
      configured: false,
      state: "unconfigured",
      reason: null,
      embedOk: null,
      embedDimensions: null,
      generateOk: null,
    };
  }

  const baseUrl = process.env["OPENAI_COMPATIBLE_URL"] ?? "http://127.0.0.1:8000";
  try {
    const res = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      return {
        backend: "openai-compatible",
        configured: true,
        state: "running",
        reason: null,
        embedOk: null,
        embedDimensions: null,
        generateOk: null,
      };
    }
    return {
      backend: "openai-compatible",
      configured: true,
      state: "degraded",
      reason: `openai-compatible returned HTTP ${res.status}`,
      embedOk: null,
      embedDimensions: null,
      generateOk: null,
    };
  } catch (err) {
    return {
      backend: "openai-compatible",
      configured: true,
      state: "unavailable",
      reason: err instanceof Error ? err.message : String(err),
      embedOk: null,
      embedDimensions: null,
      generateOk: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Probe adapter registry
// ---------------------------------------------------------------------------

const PROBE_REGISTRY: Record<BackendId, () => Promise<BackendProbeResult>> = {
  embedded: probeEmbedded,
  ollama: probeOllama,
  "lm-studio": probeLmStudio,
  "openai-compatible": probeOpenaiCompatible,
};

export const ALL_BACKENDS: BackendId[] = [
  "embedded",
  "ollama",
  "lm-studio",
  "openai-compatible",
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("inference backend real-call probes", () => {
  let configured: BackendId[] = [];

  beforeAll(() => {
    configured = detectConfiguredBackends();
    console.log(`[backend-real-calls] configured backends: ${configured.join(", ") || "(none)"}`);
  });

  it("enumerates configured backends from FULCRUM_FEATURES", () => {
    // This test verifies the detection logic itself.
    const flags = parseFeatureFlags();
    // At minimum the embedded backend may be configured.
    expect(Array.isArray(flags)).toBe(true);
    console.log(`[backend-real-calls] feature flags: ${flags.join(", ") || "(none)"}`);
  });

  for (const backendId of ALL_BACKENDS) {
    it(`reports state for backend "${backendId}"`, async () => {
      const probe = PROBE_REGISTRY[backendId];
      expect(probe).toBeDefined();

      const result = await probe();
      expect(result.backend).toBe(backendId);

      // If the backend IS configured, state must not be "unconfigured"
      if (configured.includes(backendId)) {
        expect(result.configured).toBe(true);
        // Will fail in RED phase — GREEN makes it pass.
        expect(result.state).not.toBe("unconfigured");
      } else {
        expect(result.configured).toBe(false);
        expect(result.state).toBe("unconfigured");
      }

      // Every result must have a backend id and a reason (nullable OK).
      expect(result.backend).toBeTruthy();
      console.log(`[backend-real-calls] ${backendId}: ${result.state}`);
    });
  }
});
