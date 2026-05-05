/**
 * backend-probes.ts — probe configured/enabled inference backends with
 * real embed and generate calls to verify they are truly running and healthy.
 *
 * Per D-02 and D-04: external backends are probed only, never launched.
 * Embedded is the only backend the service can start.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  BackendHealth,
  BackendId,
  BackendProbeResult,
} from "./backends/types.ts";
import { getEmbeddingModelMetadata } from "./model-metadata.ts";

// ── Probe helpers ─────────────────────────────────────────────────────────

const BACKEND_IDS: BackendId[] = [
  "embedded",
  "ollama",
  "lm-studio",
  "openai-compatible",
];

const PROBE_TIMEOUT_MS = 2_000;

async function probeEmbed(
  backend: BackendId,
  baseUrl: string,
  model: string,
): Promise<BackendProbeResult> {
  const t0 = performance.now();
  try {
    // All backends use the same OpenAI-compatible embed body
    const res = await fetch(`${baseUrl}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: "hello world",
      }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const durationMs = Math.round(performance.now() - t0);
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}`, durationMs };
    }
    const data = (await res.json()) as Record<string, unknown>;
    const vectors = (data.data as Array<{ embedding: number[] }> | undefined)
      ?.map((d) => d.embedding);
    const dims = vectors?.[0]?.length;
    return {
      ok: true,
      dimensions: dims,
      model: (data.model as string) ?? model,
      durationMs,
    };
  } catch (err) {
    const durationMs = Math.round(performance.now() - t0);
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs,
    };
  }
}

async function probeGenerate(
  backend: BackendId,
  baseUrl: string,
  model: string,
): Promise<BackendProbeResult> {
  const t0 = performance.now();
  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Return ok" }],
        max_tokens: 10,
      }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const durationMs = Math.round(performance.now() - t0);
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}`, durationMs };
    }
    return { ok: true, model, durationMs };
  } catch (err) {
    const durationMs = Math.round(performance.now() - t0);
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs,
    };
  }
}

// ── Per-backend detection ─────────────────────────────────────────────────

function parseFeatureFlags(): string[] {
  const raw = process.env["FULCRUM_FEATURES"] ?? "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function isFeatureEnabled(feature: string): boolean {
  return parseFeatureFlags().includes(feature);
}

function backendConfigured(id: BackendId): boolean {
  const flags = parseFeatureFlags();
  if (id === "embedded") {
    return isFeatureEnabled("embeddings") || isFeatureEnabled("inference");
  }
  if (flags.some((f) => f.startsWith(id))) return true;
  const backends = (process.env["FULCRUM_INFERENCE_BACKENDS"] ?? "").toLowerCase();
  return backends.includes(id);
}

function backendEnabled(id: BackendId): boolean {
  if (!backendConfigured(id)) return false;
  if (id === "embedded") return true;
  // External backends are enabled when their feature flag is active
  const cfg = (process.env["FULCRUM_INFERENCE_BACKEND"] ?? "embedded").toLowerCase();
  return cfg === id;
}

function fulcrumHome(): string {
  return process.env["FULCRUM_HOME"] ?? join(homedir(), ".fulcrum");
}

function embeddedSocketPath(): string {
  return process.env["FULCRUM_INFERENCE_SOCKET"] ?? join(fulcrumHome(), "inference.sock");
}

// ── Backend-specific probing ──────────────────────────────────────────────

const BACKEND_URLS: Record<BackendId, () => string> = {
  embedded: () => `http://localhost:8384`,
  ollama: () => process.env["OLLAMA_URL"] ?? "http://127.0.0.1:11434",
  "lm-studio": () => process.env["LM_STUDIO_URL"] ?? "http://127.0.0.1:1234",
  "openai-compatible": () =>
    process.env["FULCRUM_INFERENCE_URL"] ?? "http://127.0.0.1:8000",
};

const BACKEND_MODELS: Record<BackendId, () => string> = {
  embedded: () => getEmbeddingModelMetadata().model,
  ollama: () => process.env["OLLAMA_MODEL"] ?? "llama3.2",
  "lm-studio": () => process.env["LM_STUDIO_MODEL"] ?? "local-model",
  "openai-compatible": () => process.env["FULCRUM_INFERENCE_MODEL"] ?? "gpt-4o-mini",
};

async function probeBackend(id: BackendId): Promise<BackendHealth> {
  const configured = backendConfigured(id);
  const enabled = backendEnabled(id);
  const now = new Date().toISOString();

  if (!configured) {
    return {
      backend: id,
      configured: false,
      enabled: false,
      status: "unconfigured",
      reason: null,
      model: null,
      embedProbe: null,
      generateProbe: null,
      dimensions: null,
      lastChecked: now,
    };
  }

  if (!enabled) {
    return {
      backend: id,
      configured: true,
      enabled: false,
      status: "stopped",
      reason: "backend not selected in config",
      model: null,
      embedProbe: null,
      generateProbe: null,
      dimensions: null,
      lastChecked: now,
    };
  }

  const baseUrl = BACKEND_URLS[id]();
  const model = BACKEND_MODELS[id]();

  // For embedded: check socket first (fast path), then HTTP
  if (id === "embedded") {
    const socketPath = embeddedSocketPath();
    const socketExists = existsSync(socketPath);
    if (!socketExists) {
      return {
        backend: id,
        configured: true,
        enabled: true,
        status: "stopped",
        reason: "embedded sidecar socket not found; run `fulcrum inference start`",
        model: null,
        embedProbe: null,
        generateProbe: null,
        dimensions: null,
        lastChecked: now,
      };
    }
    // Socket exists — try to connect
    try {
      const conn = await Bun.connect({
        socket: { data: () => {}, open: () => {}, close: () => {}, drain: () => {} },
        unix: socketPath,
        timeout: 1,
      });
      conn.end();
    } catch {
      return {
        backend: id,
        configured: true,
        enabled: true,
        status: "stopped",
        reason: "embedded sidecar socket exists but not listening",
        model: null,
        embedProbe: null,
        generateProbe: null,
        dimensions: null,
        lastChecked: now,
      };
    }
  }

  // Try embed probe
  const embedProbe = await probeEmbed(id, baseUrl, model);

  // Try generate probe
  const generateProbe = await probeGenerate(id, baseUrl, model);

  const status =
    embedProbe.ok && generateProbe.ok
      ? "running"
      : embedProbe.ok !== generateProbe.ok
        ? "degraded"
        : "unavailable";

  const reasons: string[] = [];
  if (status === "degraded" || status === "unavailable") {
    if (!embedProbe.ok) reasons.push(`embed: ${embedProbe.error}`);
    if (!generateProbe.ok) reasons.push(`generate: ${generateProbe.error}`);
  }

  return {
    backend: id,
    configured: true,
    enabled: true,
    status,
    reason: reasons.length > 0 ? reasons.join("; ") : null,
    model,
    embedProbe,
    generateProbe,
    dimensions: embedProbe.dimensions ?? null,
    lastChecked: now,
  };
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Probe all configured backends and return their health states.
 * External backends are probed only; embedded status reflects sidecar state.
 */
export async function probeConfiguredBackends(): Promise<BackendHealth[]> {
  const results: BackendHealth[] = [];
  for (const id of BACKEND_IDS) {
    results.push(await probeBackend(id));
  }
  return results;
}

/** Return the list of all backend IDs. */
export function getAllBackendIds(): BackendId[] {
  return [...BACKEND_IDS];
}
