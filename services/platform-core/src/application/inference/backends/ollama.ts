/**
 * OllamaBackend — HTTP to localhost:11434 Ollama API.
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

const DEFAULT_BASE = "http://localhost:11434";

export class OllamaBackend implements InferenceBackend {
  readonly id = "ollama" as const;
  private readonly base: string;

  constructor(base?: string) {
    this.base = base ?? DEFAULT_BASE;
  }

  async embed(req: EmbedRequest): Promise<EmbedResponse> {
    const res = await this.post("/api/embed", {
      model: req.model,
      input: Array.isArray(req.input) ? req.input : [req.input],
    });
    return {
      vectors: res.embeddings,
      model: res.model ?? req.model,
      cached: false,
    };
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    const res = await this.post("/api/generate", {
      model: req.model,
      prompt: req.prompt,
      stream: false,
      options: {
        num_predict: req.maxTokens,
        temperature: req.temperature,
        stop: req.stop,
      },
    });
    return {
      text: res.response,
      model: res.model ?? req.model,
      tokens: res.eval_count ?? 0,
    };
  }

  async classify(req: ClassifyRequest): Promise<ClassifyResponse> {
    // Ollama has no native classify — simulate via generate
    const labelsStr = req.labels.join(", ");
    const prompt = `Classify the following text into exactly one of these labels: ${labelsStr}.\n\nText: "${req.input}"\n\nRespond with only the label.`;
    const gen = await this.generate({ model: req.model, prompt });
    const matched =
      req.labels.find((l) =>
        gen.text.toLowerCase().includes(l.toLowerCase()),
      ) ?? req.labels[0]!;
    const scores: Record<string, number> = {};
    for (const l of req.labels) scores[l] = l === matched ? 1 : 0;
    return { label: matched, scores, model: gen.model };
  }

  async tokenize(req: TokenizeRequest): Promise<TokenizeResponse> {
    // Ollama exposes tokenize in newer versions; fallback to estimate
    try {
      const res = await this.post("/api/tokenize", {
        model: req.model,
        text: req.input,
      });
      return {
        tokens: res.tokens ?? [],
        count: res.tokens?.length ?? 0,
        model: req.model,
      };
    } catch {
      // rough estimate: ~4 chars per token
      const estimate = Math.ceil(req.input.length / 4);
      return { tokens: [], count: estimate, model: req.model };
    }
  }

  async health(): Promise<HealthResult> {
    try {
      const res = await fetch(`${this.base}/api/tags`);
      const data = (await res.json()) as Record<string, unknown>;
      const models = ((data["models"] ?? []) as Array<{ name: string }>).map(
        (m) => m.name,
      );
      return { backend: "ollama", status: "ok", models };
    } catch (err) {
      return {
        backend: "ollama",
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
    if (!res.ok) throw new Error(`Ollama ${path}: HTTP ${res.status}`);
    return res.json();
  }
}
