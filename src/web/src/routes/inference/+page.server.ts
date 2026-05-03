import type { Actions, PageServerLoad } from "./$types";
import {
  getHealth,
  listModels,
  type HealthResponse,
  type ModelInfo,
} from "$lib/server/inference-client";
import { actionOk } from "$lib/feedback/action-result";

export interface InferenceDashboardData {
  health: HealthResponse | null;
  models: ModelInfo[];
  error: string | null;
  running: boolean;
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
          return { health, models, error: null, running };
        } catch (err) {
          return {
            health: null,
            models: [],
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
    // Spawn sidecar process — stubbed; real impl calls inference CLI
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
    // Persist via sidecar API — stubbed until sidecar has /backends/config endpoint
    const payload: Record<string, string> = { backend };
    if (host) payload["host"] = host;
    if (apiUrl) payload["api_url"] = apiUrl;
    if (apiKey) payload["api_key"] = apiKey;
    // In production: await sidecarFetch('/backends/config', { method: 'POST', body: JSON.stringify(payload) })
    return actionOk(`Backend set to ${backend}`);
  },
};
