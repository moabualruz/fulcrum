import type {
  FeatureBackendMap,
  GenerateOptions,
  HealthResult,
  InferenceBackendInfo,
  InferenceModel,
} from "@platform-core/application/inference/protocol.ts";
import { createInferenceApiCaller } from "@platform-core/interface/http/inference-api-client.ts";

export type BackendStatus = "healthy" | "degraded" | "unreachable";

export interface HealthResponse {
  status: BackendStatus;
  backends: BackendInfo[];
  cache: CacheStats;
}

export interface BackendInfo {
  name: string;
  status: BackendStatus;
  models_loaded: number;
}

export interface CacheStats {
  embed_hit_rate: number;
  gen_hit_rate: number;
  db_size_bytes: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  size_bytes: number;
  downloaded: boolean;
  capabilities: string[];
}

export interface FeatureRouting {
  feature: string;
  backend: string;
  model: string;
}

export interface InferencePageData {
  health: HealthResponse | null;
  models: ModelInfo[];
  backends: BackendInfo[];
  routing: FeatureRouting[];
  externalLlmEnabled: boolean;
  error: string | null;
}

interface LocalsLike {
  activeProjectId?: string | null;
}

interface RouteEvent {
  locals?: LocalsLike;
  fetch: typeof fetch;
  request: {
    headers: { get(name: string): string | null };
    formData(): Promise<FormData>;
  };
  url: URL;
}

interface LoadEvent extends Omit<RouteEvent, "request"> {
  request: { headers: { get(name: string): string | null } };
}

type InferenceCaller = ReturnType<typeof createInferenceApiCaller>["inference"];

function baseUrl(event: LoadEvent | RouteEvent): string {
  return process.env["FULCRUM_SERVER_URL"] ?? process.env["FULCRUM_PUBLIC_API_URL"] ?? `${event.url.protocol}//${event.url.host}`;
}

function cookieHeaders(event: LoadEvent | RouteEvent): Record<string, string> {
  const cookie = event.request.headers.get("cookie");
  return cookie ? { cookie } : {};
}

function createInferenceCaller(event: LoadEvent | RouteEvent): InferenceCaller {
  return createInferenceApiCaller({
    baseUrl: baseUrl(event),
    fetch: event.fetch,
    headers: cookieHeaders(event),
  }).inference;
}

function backendStatus(backend: InferenceBackendInfo): BackendStatus {
  if (backend.active) return "healthy";
  if (backend.available) return "degraded";
  return "unreachable";
}

function healthStatus(status: HealthResult["status"]): BackendStatus {
  if (status === "ok" || status === "healthy") return "healthy";
  if (status === "down" || status === "unreachable") return "unreachable";
  return "degraded";
}

function modelToPageModel(model: InferenceModel): ModelInfo {
  return {
    id: model.id,
    name: model.id,
    size_bytes: model.sizeBytesActual ?? model.sizeBytes ?? 0,
    downloaded: model.downloaded,
    capabilities: [model.kind],
  };
}

function backendToPageBackend(
  backend: InferenceBackendInfo,
  loadedModelCount: number,
): BackendInfo {
  return {
    name: backend.id,
    status: backendStatus(backend),
    models_loaded: backend.active ? loadedModelCount : 0,
  };
}

function healthToPageHealth(
  health: HealthResult,
  backends: BackendInfo[],
): HealthResponse {
  return {
    status: healthStatus(health.status),
    backends,
    cache: {
      embed_hit_rate: 0,
      gen_hit_rate: 0,
      db_size_bytes: 0,
    },
  };
}

function routingToPageRouting(config: FeatureBackendMap): FeatureRouting[] {
  return Object.entries(config).map(([feature, backend]) => ({
    feature,
    backend,
    model: backend,
  }));
}

async function loadInferenceData(event: LoadEvent): Promise<InferencePageData> {
  try {
    const caller = createInferenceCaller(event);
    const [health, models, backends, routing] = await Promise.all([
      caller.health(),
      caller.models.list(),
      caller.backends.list(),
      caller.config.get(),
    ]);
    const pageModels = models.map(modelToPageModel);
    const pageBackends = backends.map((backend) =>
      backendToPageBackend(backend, pageModels.length)
    );
    const resolvedBackends = pageBackends.length > 0
      ? pageBackends
      : health.backends.map((name) => ({
        name,
        status: "healthy" as BackendStatus,
        models_loaded: health.models.length,
      }));

    return {
      health: healthToPageHealth(health, resolvedBackends),
      models: pageModels,
      backends: resolvedBackends,
      routing: routingToPageRouting(routing),
      externalLlmEnabled: backends.some((backend) =>
        backend.id === "openai-compatible" && backend.available
      ),
      error: null,
    };
  } catch (err) {
    return {
      health: null,
      models: [],
      backends: [],
      routing: [],
      externalLlmEnabled: false,
      error: err instanceof Error ? err.message : "Inference API unreachable",
    };
  }
}

export const load = async (event: LoadEvent) => {
  const inference = loadInferenceData(event);
  return {
    activeProjectId: event.locals?.activeProjectId ?? null,
    streamed: {
      inference,
      health: inference.then((data) =>
        data.health ?? ({ status: "unreachable" } as HealthResponse)
      ),
    },
  };
};

export const actions = {
  testEmbed: async (event: RouteEvent) => {
    const form = await event.request.formData();
    const text = String(form.get("text") ?? "");
    const result = await createInferenceCaller(event).embed({ texts: [text] });
    const preview = result.vectors[0] ?? [];
    return {
      success: true,
      dimensions: result.dimensions,
      preview: preview.slice(0, 8),
      model: result.model,
      cached: result.cached,
    };
  },
  testGenerate: async (event: RouteEvent) => {
    const form = await event.request.formData();
    const prompt = String(form.get("prompt") ?? "");
    const maxTokensValue = form.get("maxTokens");
    const schemaValue = form.get("schema");
    const options: NonNullable<GenerateOptions> = {};
    if (typeof maxTokensValue === "string" && maxTokensValue.trim() !== "") {
      options.maxTokens = Number(maxTokensValue);
    }
    if (typeof schemaValue === "string" && schemaValue.trim() !== "") {
      options.schema = JSON.parse(schemaValue) as Record<string, unknown>;
    }

    const result = await createInferenceCaller(event).generate({ prompt, options });
    return {
      success: true,
      generateText: result.text,
      text: result.text,
      tokens: result.tokens,
      model: result.model,
      ...(options.schema ? { schemaValid: true } : {}),
    };
  },
};
