import { InferenceClient } from "@/inference/client.ts";
import type {
  GenerateOptions,
  HealthResult,
  InferenceBackendInfo,
  InferenceModel,
} from "@/inference/protocol.ts";
import { INFERENCE_CLIENT_TOKEN } from "@/inference/tokens.ts";
import { getRoutingConfig } from "@/inference/routing-config.ts";
import {
  getHealth,
  listModels,
  listBackends,
  listRouting,
  isExternalLlmEnabled,
  testEmbed,
  testGenerate,
  type HealthResponse,
  type ModelInfo,
  type BackendInfo,
  type FeatureRouting,
} from "../../../lib/server/inference-client.ts";

export interface InferencePageData {
  health: HealthResponse | null;
  models: ModelInfo[];
  backends: BackendInfo[];
  routing: FeatureRouting[];
  externalLlmEnabled: boolean;
  error: string | null;
}

interface ContainerLike {
  has?: (token: unknown) => boolean;
  get: (token: unknown) => unknown;
}

interface LocalsLike {
  activeProjectId?: string | null;
  container?: ContainerLike | null;
}

interface LoadEvent {
  locals?: LocalsLike;
}

interface ActionEvent {
  request: Request;
  locals?: LocalsLike;
}

function hasBinding(container: ContainerLike, token: unknown): boolean {
  return container.has?.(token) ?? true;
}

function boundInferenceClient(container?: ContainerLike | null): InferenceClient | null {
  if (!container) return null;
  if (hasBinding(container, INFERENCE_CLIENT_TOKEN)) {
    const client = container.get(INFERENCE_CLIENT_TOKEN);
    if (client instanceof InferenceClient || typeof (client as InferenceClient).health === "function") {
      return client as InferenceClient;
    }
  }
  if (hasBinding(container, InferenceClient)) {
    const client = container.get(InferenceClient);
    if (client instanceof InferenceClient || typeof (client as InferenceClient).health === "function") {
      return client as InferenceClient;
    }
  }
  return null;
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

function backendToPageBackend(backend: InferenceBackendInfo): BackendInfo {
  return {
    name: backend.id,
    status: backend.active ? "healthy" : backend.available ? "degraded" : "unreachable",
    models_loaded: backend.active ? 1 : 0,
  };
}

function healthToPageHealth(health: HealthResult): HealthResponse {
  return {
    status: health.status === "ok" ? "healthy" : health.status === "down" ? "unreachable" : "degraded",
    backends: health.backends.map((name) => ({ name, status: "healthy", models_loaded: 0 })),
    cache: {
      embed_hit_rate: 0,
      gen_hit_rate: 0,
      db_size_bytes: 0,
    },
  };
}

function localRouting(): FeatureRouting[] {
  return Object.entries(getRoutingConfig()).map(([feature, backend]) => ({
    feature,
    backend,
    model: backend,
  }));
}

function localExternalLlmEnabled(): boolean {
  return (process.env["FULCRUM_FEATURES"] ?? "")
    .split(",")
    .map((feature) => feature.trim())
    .includes("external-llm-provider");
}

async function loadFromBoundClient(client: InferenceClient): Promise<InferencePageData> {
  const health = await client.health();
  const [models, backends] = await Promise.all([
    client.listModels().catch(() => [] as InferenceModel[]),
    client.listBackends().catch(() => [] as InferenceBackendInfo[]),
  ]);
  const pageHealth = healthToPageHealth(health);
  return {
    health: pageHealth,
    models: models.map(modelToPageModel),
    backends: backends.length > 0 ? backends.map(backendToPageBackend) : pageHealth.backends,
    routing: localRouting(),
    externalLlmEnabled: localExternalLlmEnabled(),
    error: null,
  };
}

async function loadFromHttpSidecar(): Promise<InferencePageData> {
  const [health, models, backends, routing, externalLlmEnabled] =
    await Promise.all([
      getHealth(),
      listModels(),
      listBackends(),
      listRouting(),
      isExternalLlmEnabled(),
    ]);
  return { health, models, backends, routing, externalLlmEnabled, error: null };
}

async function loadInferenceData(locals: LocalsLike): Promise<InferencePageData> {
  try {
    const client = boundInferenceClient(locals.container);
    if (client) return await loadFromBoundClient(client);
    if (!process.env["FULCRUM_INFERENCE_URL"]) {
      return await loadFromBoundClient(new InferenceClient());
    }
    return await loadFromHttpSidecar();
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
}

async function resolveActionClient(locals: LocalsLike): Promise<InferenceClient | null> {
  return boundInferenceClient(locals.container);
}

export const load = async ({ locals = {} }: LoadEvent) => {
  const inference = loadInferenceData(locals);
  return {
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      inference,
      health: inference.then((data) =>
        data.health ?? ({ status: "unreachable" } as unknown as HealthResult | HealthResponse)
      ),
    },
  };
};

export const actions = {
  testEmbed: async ({ request, locals = {} }: ActionEvent) => {
    const form = await request.formData();
    const text = String(form.get("text") ?? "");
    const client = await resolveActionClient(locals);
    if (!client) {
      const result = await testEmbed(text);
      return {
        success: true,
        dimensions: result.dimensions,
        preview: result.embedding.slice(0, 8),
        model: result.model,
        cached: false,
      };
    }

    const result = await client.embed([text]);
    const preview = result.vectors[0] ?? [];
    return {
      success: true,
      dimensions: preview.length,
      preview,
      model: result.model,
      cached: result.cached,
    };
  },
  testGenerate: async ({ request, locals = {} }: ActionEvent) => {
    const form = await request.formData();
    const prompt = String(form.get("prompt") ?? "");
    const maxTokensValue = form.get("maxTokens");
    const schemaValue = form.get("schema");
    const options: GenerateOptions = {};
    if (typeof maxTokensValue === "string" && maxTokensValue.trim() !== "") {
      options.maxTokens = Number(maxTokensValue);
    }
    if (typeof schemaValue === "string" && schemaValue.trim() !== "") {
      options.schema = JSON.parse(schemaValue) as Record<string, unknown>;
    }

    const client = await resolveActionClient(locals);
    if (!client) {
      const result = await testGenerate(prompt);
      return {
        success: true,
        generateText: result.text,
        text: result.text,
        tokens: result.tokens_used,
        model: result.model,
        ...(options.schema ? { schemaValid: true } : {}),
      };
    }

    const result = await client.generate(prompt, options);
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
