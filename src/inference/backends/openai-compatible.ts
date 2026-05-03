/**
 * OpenAICompatibleBackend — any OpenAI-compat endpoint, gated by external-llm-provider flag.
 * URL + API key from constructor opts or FULCRUM_INFERENCE_URL + FULCRUM_INFERENCE_API_KEY.
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

export interface OpenAICompatibleOpts {
  url?: string;
  apiKey?: string;
}

export class OpenAICompatibleBackend implements InferenceBackend {
  readonly id = "openai-compatible" as const;
  private readonly base: string;
  private readonly apiKey: string;

  constructor(opts?: OpenAICompatibleOpts) {
    this.base = opts?.url ?? process.env["FULCRUM_INFERENCE_URL"] ?? "";
    this.apiKey =
      opts?.apiKey ?? process.env["FULCRUM_INFERENCE_API_KEY"] ?? "";
  }

  async embed(req: EmbedRequest): Promise<EmbedResponse> {
    const res = await this.post("/v1/embeddings", {
      model: req.model,
      input: Array.isArray(req.input) ? req.input : [req.input],
    });
    const vectors = (res.data as Array<{ embedding: number[] }>).map(
      (d) => d.embedding,
    );
    return { vectors, model: res.model ?? req.model, cached: false };
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    const res = await this.post("/v1/chat/completions", {
      model: req.model,
      messages: [{ role: "user", content: req.prompt }],
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      stop: req.stop,
    });
    const text = res.choices?.[0]?.message?.content ?? "";
    const tokens = res.usage?.completion_tokens ?? 0;
    return { text, model: res.model ?? req.model, tokens };
  }

  async classify(req: ClassifyRequest): Promise<ClassifyResponse> {
    const labelsStr = req.labels.join(", ");
    const gen = await this.generate({
      model: req.model,
      prompt: `Classify into one label (${labelsStr}): "${req.input}". Respond with only the label.`,
    });
    const matched =
      req.labels.find((l) =>
        gen.text.toLowerCase().includes(l.toLowerCase()),
      ) ?? req.labels[0]!;
    const scores: Record<string, number> = {};
    for (const l of req.labels) scores[l] = l === matched ? 1 : 0;
    return { label: matched, scores, model: gen.model };
  }

  async tokenize(req: TokenizeRequest): Promise<TokenizeResponse> {
    const estimate = Math.ceil(req.input.length / 4);
    return { tokens: [], count: estimate, model: req.model };
  }

  async health(): Promise<HealthResult> {
    try {
      const res = await fetch(`${this.base}/v1/models`, {
        headers: this.headers(),
      });
      const data = (await res.json()) as Record<string, unknown>;
      const models = ((data["data"] ?? []) as Array<{ id: string }>).map((m) => m.id);
      return { backend: "openai-compatible", status: "ok", models };
    } catch (err) {
      return {
        backend: "openai-compatible",
        status: "down",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) h["Authorization"] = `Bearer ${this.apiKey}`;
    return h;
  }

  private async post(path: string, body: unknown): Promise<any> {
    const res = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`OpenAI-compat ${path}: HTTP ${res.status}`);
    return res.json();
  }
}
