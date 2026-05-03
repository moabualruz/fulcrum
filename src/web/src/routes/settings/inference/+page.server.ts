import type { PageServerLoad } from "./$types";
import {
  getHealth,
  listModels,
  listBackends,
  listRouting,
  isExternalLlmEnabled,
  type HealthResponse,
  type ModelInfo,
  type BackendInfo,
  type FeatureRouting,
} from "$lib/server/inference-client";

export interface InferencePageData {
  health: HealthResponse | null;
  models: ModelInfo[];
  backends: BackendInfo[];
  routing: FeatureRouting[];
  externalLlmEnabled: boolean;
  error: string | null;
}

export const load: PageServerLoad = async ({ locals }) => {
  return {
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      inference: (async (): Promise<InferencePageData> => {
        try {
          const [health, models, backends, routing, externalLlmEnabled] =
            await Promise.all([
              getHealth(),
              listModels(),
              listBackends(),
              listRouting(),
              isExternalLlmEnabled(),
            ]);
          return { health, models, backends, routing, externalLlmEnabled, error: null };
        } catch (err) {
          return {
            health: null,
            models: [],
            backends: [],
            routing: [],
            externalLlmEnabled: false,
            error: err instanceof Error ? err.message : "Inference sidecar unreachable",
          };
        }
      })(),
    },
  };
};
