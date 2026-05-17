/**
 * EmbeddedBackend — routes to local inference sidecar via HTTP (Unix socket or TCP).
 */
import type {
  InferenceBackend,
  EmbedRequest,
  EmbedResponse,
  GenerateRequest,
  GenerateResponse,
  ClassifyRequest,
  ClassifyResponse,
  TokenizeRequest,
  TokenizeResponse,
  HealthResult,
} from "./types.ts";

const DEFAULT_BASE = "http://localhost:8384";

export class EmbeddedBackend implements InferenceBackend {
  readonly id = "embedded" as const;
  private readonly base: string;

  constructor(base?: string) {
    this.base = base ?? DEFAULT_BASE;
  }

  async embed(req: EmbedRequest): Promise<EmbedResponse> {
    const res = await this.post("/embed", {
      model: req.model,
      input: Array.isArray(req.input) ? req.input : [req.input],
    });
    return { vectors: res.vectors, model: res.model, cached: res.cached ?? false };
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    const res = await this.post("/generate", {
      model: req.model,
      prompt: req.prompt,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      stop: req.stop,
    });
    return { text: res.text, model: res.model, tokens: res.tokens };
  }

  async classify(req: ClassifyRequest): Promise<ClassifyResponse> {
    const res = await this.post("/classify", {
      model: req.model,
      input: req.input,
      labels: req.labels,
    });
    return { label: res.label, scores: res.scores, model: res.model };
  }

  async tokenize(req: TokenizeRequest): Promise<TokenizeResponse> {
    const res = await this.post("/tokenize", {
      model: req.model,
      input: req.input,
    });
    return { tokens: res.tokens, count: res.count, model: res.model };
  }

  async health(): Promise<HealthResult> {
    try {
      const res = await fetch(`${this.base}/health`);
      const data = (await res.json()) as Record<string, unknown>;
      return {
        backend: "embedded",
        status: (data["status"] as HealthResult["status"]) ?? "ok",
        version: data["version"] as string | undefined,
        models: data["models"] as string[] | undefined,
      };
    } catch (err) {
      return {
        backend: "embedded",
        status: "down",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async post(path: string, body: unknown): Promise<any> {
    const res = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Embedded ${path}: HTTP ${res.status}`);
    return res.json();
  }
}
