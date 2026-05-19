import type { BackendHealth } from "@platform-core/application/inference/backends/types.ts";
import type {
  ClassifyResult,
  EmbedResult,
  FeatureBackendMap,
  GenerateOptions,
  GenerateResult,
  HealthResult,
  InferenceBackendInfo,
  InferenceModel,
  ModelPullProgress,
  TokenizeResult,
} from "@platform-core/application/inference/protocol.ts";

export type {
  ClassifyResult,
  EmbedResult,
  FeatureBackendMap,
  GenerateOptions,
  GenerateResult,
  HealthResult,
  InferenceBackendInfo,
  InferenceModel,
  ModelPullProgress,
  TokenizeResult,
} from "@platform-core/application/inference/protocol.ts";

export interface InferenceApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
}

export interface InferenceApiClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createInferenceApiCaller(options: InferenceApiClientOptions) {
  const request = inferenceRequest(options);
  return {
    inference: {
      health: async () => await request<HealthResult>("/api/v1/inference/health"),
      embed: async (input: { texts: string[]; model?: string }) =>
        await request<EmbedResult>("/api/v1/inference/embed", { method: "POST", body: input }),
      generate: async (input: {
        prompt: string;
        options?: NonNullable<GenerateOptions>;
      }) =>
        await request<GenerateResult>("/api/v1/inference/generate", {
          method: "POST",
          body: { prompt: input.prompt, ...compact(input.options ?? {}) },
        }),
      classify: async (input: { text: string; labels: string[] }) =>
        await request<ClassifyResult>("/api/v1/inference/classify", { method: "POST", body: input }),
      tokenize: async (input: { text: string; model?: string }) =>
        await request<TokenizeResult>("/api/v1/inference/tokenize", { method: "POST", body: input }),
      models: {
        list: async () => await request<InferenceModel[]>("/api/v1/inference/models"),
        pull: async (input: { modelId: string; force?: boolean }) =>
          await request<ModelPullProgress[]>(`/api/v1/inference/models/${encodeURIComponent(input.modelId)}/pull`, {
            method: "POST",
            body: { force: input.force ?? false },
          }),
        rm: async (input: { modelId: string }) =>
          await request<{ ok: boolean }>(`/api/v1/inference/models/${encodeURIComponent(input.modelId)}`, {
            method: "DELETE",
          }),
      },
      backends: {
        list: async () => await request<InferenceBackendInfo[]>("/api/v1/inference/backends"),
        probe: async () => await request<BackendHealth[]>("/api/v1/inference/backends/probe"),
      },
      config: {
        get: async () => await request<FeatureBackendMap>("/api/v1/inference/config"),
        set: async (input: { feature: string; backend: string }) =>
          await request<{ ok: boolean; config: FeatureBackendMap }>("/api/v1/inference/config", { method: "PATCH", body: input }),
      },
      provider: {
        set: async (input: { url: string; key: string }) =>
          await request<{
            ok: boolean;
            url: string;
            credentialRef: { kind: "env"; name: "FULCRUM_INFERENCE_API_KEY"; redacted: true };
          }>("/api/v1/inference/provider", { method: "PATCH", body: input }),
        test: async () => await request<{ ok: boolean; latency_ms?: number; error?: string }>("/api/v1/inference/provider/test", { method: "POST" }),
      },
    },
  };
}

export function createInferenceApiCallerFromEnv(
  env: InferenceApiEnvironment = process.env as unknown as InferenceApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  if (!baseUrl) return null;
  return createInferenceApiCaller({ baseUrl, fetch: fetchFn });
}

function inferenceRequest(options: InferenceApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchFn = options.fetch ?? fetch;

  return async function request<T = unknown>(
    path: string,
    init: { method?: string; query?: JsonRecord; body?: JsonRecord } = {},
  ): Promise<T> {
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(compact(init.query ?? {}))) {
      url.searchParams.set(key, String(value));
    }
    const response = await fetchFn(url.toString(), {
      method: init.method ?? "GET",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...options.headers,
      },
      body: init.body ? JSON.stringify(compact(init.body)) : undefined,
    });
    const body = await parseResponseBody(response);
    if (!response.ok) throw new Error(extractErrorMessage(body, response.status));
    return body as T;
  };
}

function compact(input: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0)
    ),
  );
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(body: unknown, status: number): string {
  const record = body as { message?: string; error?: { message?: string; json?: { message?: string } } } | null;
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Inference API request failed with ${status}.`;
}
