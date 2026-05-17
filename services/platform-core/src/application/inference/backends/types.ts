/**
 * Inference backend abstraction — shared types for all backends.
 *
 * WHY separate file: backends + client both import these without circular deps.
 */

// ── Request / Response shapes ──────────────────────────────────────────

export interface EmbedRequest {
  readonly model: string;
  readonly input: string | readonly string[];
}

export interface EmbedResponse {
  readonly vectors: readonly number[][];
  readonly model: string;
  readonly cached: boolean;
}

export interface GenerateRequest {
  readonly model: string;
  readonly prompt: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly stop?: readonly string[];
}

export interface GenerateResponse {
  readonly text: string;
  readonly model: string;
  readonly tokens: number;
}

export interface ClassifyRequest {
  readonly model: string;
  readonly input: string;
  readonly labels: readonly string[];
}

export interface ClassifyResponse {
  readonly label: string;
  readonly scores: Readonly<Record<string, number>>;
  readonly model: string;
}

export interface TokenizeRequest {
  readonly model: string;
  readonly input: string;
}

export interface TokenizeResponse {
  readonly tokens: readonly number[];
  readonly count: number;
  readonly model: string;
}

export interface HealthResult {
  readonly backend: BackendId;
  readonly status: "ok" | "degraded" | "down";
  readonly version?: string;
  readonly models?: readonly string[];
  readonly error?: string;
}

// ── Backend identifiers ────────────────────────────────────────────────

export const BACKEND_IDS = [
  "embedded",
  "ollama",
  "lm-studio",
  "openai-compatible",
] as const;

export type BackendId = (typeof BACKEND_IDS)[number];

// ── Feature qualifier ──────────────────────────────────────────────────

/** e.g. "embeddings:ollama" → use Ollama for embed calls */
export type FeatureQualifier = `${InferenceFeature}:${BackendId}`;

export type InferenceFeature =
  | "embeddings"
  | "router-llm"
  | "classify"
  | "tokenize";

// ── Backend health / probe types ──────────────────────────────────────

/** Result of a single probe call (embed or generate). */
export interface BackendProbeResult {
  ok: boolean;
  model?: string;
  dimensions?: number;
  error?: string;
  durationMs?: number;
}

/** Per-backend health state for surfaces (CLI, tRPC, doctor). */
export interface BackendHealth {
  readonly backend: BackendId;
  readonly configured: boolean;
  readonly enabled: boolean;
  readonly status: "running" | "stopped" | "degraded" | "unavailable" | "unconfigured";
  readonly reason: string | null;
  readonly model: string | null;
  readonly embedProbe: BackendProbeResult | null;
  readonly generateProbe: BackendProbeResult | null;
  readonly dimensions: number | null;
  readonly lastChecked: string | null;
}

// ── Backend interface ──────────────────────────────────────────────────

export interface InferenceBackend {
  readonly id: BackendId;
  embed(req: EmbedRequest): Promise<EmbedResponse>;
  generate(req: GenerateRequest): Promise<GenerateResponse>;
  classify(req: ClassifyRequest): Promise<ClassifyResponse>;
  tokenize(req: TokenizeRequest): Promise<TokenizeResponse>;
  health(): Promise<HealthResult>;
}
