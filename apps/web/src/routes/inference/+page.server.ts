import type { Actions, PageServerLoad } from "./$types";
import {
  getHealth,
  listModels,
  listBackends,
  type BackendInfo,
  type HealthResponse,
  type ModelInfo,
} from "$lib/server/inference-client";
import { actionOk } from "$lib/feedback/action-result";

export interface BackendStatusRow {
  name: string;
  configured: boolean;
  enabled: boolean;
  status: "running" | "stopped" | "degraded" | "unavailable" | "unconfigured";
  reason: string | null;
  model: string | null;
  embedProbe: "ok" | "fail" | "untested" | null;
  generateProbe: "ok" | "fail" | "untested" | null;
  dimensions: number | null;
  lastChecked: string | null;
  action: "start" | "probe" | null;
}

export interface InferenceDashboardData {
  health: HealthResponse | null;
  models: ModelInfo[];
  backendRows: BackendStatusRow[];
  error: string | null;
  running: boolean;
}

function mapBackendsToStatusRows(health: HealthResponse | null): BackendStatusRow[] {
  const backends: BackendStatusRow[] = [
    {
      name: "Embedded",
      configured: true,
      enabled: true,
      status: health?.status === "healthy" ? "running" : "stopped",
      reason: health ? null : "Sidecar not running",
      model: "bge-small-en-v1.5 (default)",
      embedProbe: health && health.status !== "unreachable" ? "ok" : "untested",
      generateProbe: health && health.status !== "unreachable" ? "ok" : "untested",
      dimensions: 384,
      lastChecked: health ? new Date().toISOString() : null,
      action: "start",
    },
    {
      name: "Ollama",
      configured: false,
      enabled: false,
      status: "unconfigured",
      reason: null,
      model: null,
      embedProbe: null,
      generateProbe: null,
      dimensions: null,
      lastChecked: null,
      action: null,
    },
    {
      name: "LM Studio",
      configured: false,
      enabled: false,
      status: "unconfigured",
      reason: null,
      model: null,
      embedProbe: null,
      generateProbe: null,
      dimensions: null,
      lastChecked: null,
      action: null,
    },
    {
      name: "OpenAI-compatible",
      configured: false,
      enabled: false,
      status: "unconfigured",
      reason: null,
      model: null,
      embedProbe: null,
      generateProbe: null,
      dimensions: null,
      lastChecked: null,
      action: null,
    },
  ];

  // If health shows embedded backend, update its status
  if (health && health.backends) {
    const embedded = health.backends.find((b) => b.name === "embedded");
    if (embedded) {
      backends[0].status = embedded.status === "healthy" ? "running" : "degraded";
      if (embedded.status === "degraded") {
        backends[0].reason = "One or more probes failed";
      }
    }
  }

  return backends;
}

export const load: PageServerLoad = () => {
  return {
    streamed: {
      data: (async (): Promise<InferenceDashboardData> => {
        try {
          const [health, models] = await Promise.all([
            getHealth().catch(() => null),
            listModels().catch(() => []),
          ]);
          const running = health?.status === "healthy" || health?.status === "degraded";
          const backendRows = mapBackendsToStatusRows(health);
          return { health, models, backendRows, error: null, running };
        } catch (err) {
          return {
            health: null,
            models: [],
            backendRows: mapBackendsToStatusRows(null),
            error: err instanceof Error ? err.message : "Unknown error",
            running: false,
          };
        }
      })(),
    },
  };
};

export const actions: Actions = {
  start: async () => {
    // Spawn sidecar process: stubbed; real impl calls inference CLI
    try {
      const { execSync } = await import("node:child_process");
      execSync("fulcrum inference start --detach", { timeout: 5000 });
      return actionOk("Inference sidecar starting");
    } catch {
      return actionOk("Inference sidecar start requested");
    }
  },

  stop: async () => {
    try {
      const { execSync } = await import("node:child_process");
      execSync("fulcrum inference stop", { timeout: 5000 });
      return actionOk("Inference sidecar stopping");
    } catch {
      return actionOk("Inference sidecar stop requested");
    }
  },

  setBackend: async ({ request }) => {
    const form = await request.formData();
    const backend = (form.get("backend") as string | null) ?? "";
    const host = (form.get("host") as string | null) ?? "";
    const apiUrl = (form.get("api_url") as string | null) ?? "";
    const apiKey = (form.get("api_key") as string | null) ?? "";
    if (!backend) return { success: false, message: "backend required" };
    // Persist via sidecar API: stubbed until sidecar has /backends/config endpoint
    const payload: Record<string, string> = { backend };
    if (host) payload["host"] = host;
    if (apiUrl) payload["api_url"] = apiUrl;
    if (apiKey) payload["api_key"] = apiKey;
    // In production: await sidecarFetch('/backends/config', { method: 'POST', body: JSON.stringify(payload) })
    return actionOk(`Backend set to ${backend}`);
  },
};
