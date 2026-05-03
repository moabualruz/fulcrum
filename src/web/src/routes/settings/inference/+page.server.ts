import { InferenceClient } from "../../../../../inference/client.ts";
import { INFERENCE_CLIENT_TOKEN } from "../../../../../inference/tokens.ts";
import type { Session } from "better-auth";

interface InferenceLocals {
  session?: Session | null;
  orgId?: string | null;
  container?: import("@needle-di/core").Container | null;
}

function resolveClient(container: InferenceLocals["container"]): InferenceClient {
  if (container?.has(INFERENCE_CLIENT_TOKEN)) {
    return container.get(INFERENCE_CLIENT_TOKEN);
  }
  if (container?.has(InferenceClient)) {
    return container.get(InferenceClient);
  }
  return new InferenceClient();
}

function embeddingsFeatureEnabled(): boolean {
  return (process.env["FULCRUM_FEATURES"] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .includes("embeddings");
}

function operationGate(locals: InferenceLocals): { ok: true } | { ok: false; error: string } {
  if (!locals.session) {
    return { ok: false, error: "Authentication required." };
  }
  if (!locals.orgId) {
    return { ok: false, error: "Organization required." };
  }
  if (!embeddingsFeatureEnabled()) {
    return { ok: false, error: "Enable the embeddings feature flag to test classify or tokenize." };
  }
  return { ok: true };
}

export function load({ locals }: { locals: InferenceLocals }) {
  const client = resolveClient(locals.container ?? null);

  return {
    streamed: {
      health: client.health(),
      models: client.listModels(),
    },
  };
}

export const actions = {
  pullModel: async ({ request, locals }: { request: Request; locals: InferenceLocals }) => {
    const form = await request.formData();
    const modelId = String(form.get("modelId") ?? "").trim();
    if (!modelId) {
      return {
        success: false,
        error: "Select a model to download.",
      };
    }
    if (!locals.session) {
      return {
        success: false,
        error: "Authentication required.",
      };
    }

    try {
      const client = resolveClient(locals.container ?? null);
      let last = { modelId, pct: 0, downloaded: 0, total: 0 };
      for await (const event of client.pullModel(modelId)) {
        last = { modelId, pct: event.pct, downloaded: event.downloaded, total: event.total };
      }
      return {
        success: true,
        pullProgress: last,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Model download failed.",
      };
    }
  },

  testEmbed: async ({ request, locals }: { request: Request; locals: InferenceLocals }) => {
    const form = await request.formData();
    const text = String(form.get("text") ?? "").trim();
    if (!text) {
      return {
        success: false,
        error: "Enter text to embed.",
      };
    }
    if (!locals.session) {
      return {
        success: false,
        error: "Authentication required.",
      };
    }

    try {
      const client = resolveClient(locals.container ?? null);
      const result = await client.embed([text]);
      const vector = result.vectors[0] ?? [];
      return {
        success: true,
        dimensions: vector.length,
        preview: vector.slice(0, 5),
        model: result.model,
        cached: result.cached,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Smoke embed failed.",
      };
    }
  },

  testGenerate: async ({ request, locals }: { request: Request; locals: InferenceLocals }) => {
    const form = await request.formData();
    const prompt = String(form.get("prompt") ?? "").trim();
    const maxTokens = parseInt(String(form.get("maxTokens") ?? "64"), 10) || 64;
    const schemaRaw = String(form.get("schema") ?? "").trim();
    if (!prompt) {
      return { success: false, error: "Enter a prompt." };
    }
    if (!locals.session) {
      return { success: false, error: "Authentication required." };
    }

    let schema: Record<string, unknown> | undefined;
    if (schemaRaw) {
      try {
        schema = JSON.parse(schemaRaw) as Record<string, unknown>;
      } catch {
        return { success: false, generateError: "Invalid JSON in schema field." };
      }
    }

    try {
      const client = resolveClient(locals.container ?? null);
      const result = await client.generate(prompt, { maxTokens, schema });

      // When schema provided, validate the output is valid JSON matching the schema
      let schemaValid: boolean | undefined;
      if (schema) {
        try {
          JSON.parse(result.text);
          schemaValid = true;
        } catch {
          schemaValid = false;
        }
      }

      return {
        success: true,
        generateText: result.text,
        generateTokens: result.tokens,
        ...(schemaValid !== undefined ? { schemaValid } : {}),
      };
    } catch (error) {
      return {
        success: false,
        generateError: error instanceof Error ? error.message : "Generate test failed.",
      };
    }
  },

  testClassify: async ({ request, locals }: { request: Request; locals: InferenceLocals }) => {
    const form = await request.formData();
    const text = String(form.get("text") ?? "").trim();
    const labels = String(form.get("labels") ?? "")
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean);
    if (!text) {
      return { success: false, error: "Enter text to classify." };
    }
    if (labels.length === 0) {
      return { success: false, error: "Enter at least one label." };
    }
    const gate = operationGate(locals);
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }

    try {
      const client = resolveClient(locals.container ?? null);
      return {
        success: true,
        classifyResults: await client.classify(text, labels),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Classify test failed.",
      };
    }
  },

  testTokenize: async ({ request, locals }: { request: Request; locals: InferenceLocals }) => {
    const form = await request.formData();
    const text = String(form.get("text") ?? "").trim();
    if (!text) {
      return { success: false, error: "Enter text to tokenize." };
    }
    const gate = operationGate(locals);
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }

    try {
      const client = resolveClient(locals.container ?? null);
      return {
        success: true,
        tokenizeResult: await client.tokenize(text),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Tokenize test failed.",
      };
    }
  },
};
