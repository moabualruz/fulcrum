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

// ── Backend interface ──────────────────────────────────────────────────

export interface InferenceBackend {
  readonly id: BackendId;
  embed(req: EmbedRequest): Promise<EmbedResponse>;
  generate(req: GenerateRequest): Promise<GenerateResponse>;
  classify(req: ClassifyRequest): Promise<ClassifyResponse>;
  tokenize(req: TokenizeRequest): Promise<TokenizeResponse>;
  health(): Promise<HealthResult>;
}
