/**
 * Thin HTTP client for the inference sidecar.
 *
 * Every function returns a typed result or throws. The caller (page.server.ts)
 * catches and degrades gracefully when the sidecar is down.
 */

const TIMEOUT_MS = 5_000;

function sidecarBaseUrl(): string {
  return process.env["FULCRUM_INFERENCE_URL"] ?? "http://127.0.0.1:8420";
}

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

export interface EmbedResult {
  embedding: number[];
  dimensions: number;
  model: string;
}

export interface GenerateResult {
  text: string;
  tokens_used: number;
  model: string;
}

export interface ClassifyResult {
  label: string;
  confidence: number;
  model: string;
}

export interface TokenizeResult {
  tokens: number[];
  count: number;
  model: string;
}

async function sidecarFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(String(new URL(path, sidecarBaseUrl())), {
      ...init,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Sidecar ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function getHealth(): Promise<HealthResponse> {
  return sidecarFetch<HealthResponse>("/health");
}

export async function listModels(): Promise<ModelInfo[]> {
  return sidecarFetch<ModelInfo[]>("/models");
}

export async function listBackends(): Promise<BackendInfo[]> {
  return sidecarFetch<BackendInfo[]>("/backends");
}

export async function listRouting(): Promise<FeatureRouting[]> {
  return sidecarFetch<FeatureRouting[]>("/routing");
}

export async function pullModel(modelId: string): Promise<ReadableStream<Uint8Array>> {
  const controller = new AbortController();
  // No timeout for pull — it's long-running
  const res = await fetch(String(new URL(`/models/${encodeURIComponent(modelId)}/pull`, sidecarBaseUrl())), {
    method: "POST",
    signal: controller.signal,
  });
  if (!res.ok) {
    throw new Error(`Sidecar ${res.status}: ${await res.text()}`);
  }
  if (!res.body) throw new Error("No stream body from pull endpoint");
  return res.body;
}

export async function removeModel(modelId: string): Promise<void> {
  await sidecarFetch<{ ok: boolean }>(`/models/${encodeURIComponent(modelId)}`, {
    method: "DELETE",
  });
}

export async function testEmbed(text: string): Promise<EmbedResult> {
  return sidecarFetch<EmbedResult>("/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

export async function testGenerate(prompt: string): Promise<GenerateResult> {
  return sidecarFetch<GenerateResult>("/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
}

export async function testClassify(text: string): Promise<ClassifyResult> {
  return sidecarFetch<ClassifyResult>("/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

export async function testTokenize(text: string): Promise<TokenizeResult> {
  return sidecarFetch<TokenizeResult>("/tokenize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

export async function clearCache(): Promise<void> {
  await sidecarFetch<{ ok: boolean }>("/cache/clear", { method: "POST" });
}

export async function isExternalLlmEnabled(): Promise<boolean> {
  try {
    const result = await sidecarFetch<{ enabled: boolean }>("/features/external-llm-provider");
    return result.enabled;
  } catch {
    return false;
  }
}
