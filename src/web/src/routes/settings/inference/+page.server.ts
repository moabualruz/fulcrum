import { InferenceClient } from "../../../../../inference/client.ts";
import { INFERENCE_CLIENT_TOKEN } from "../../../../../inference/tokens.ts";
import type { Session } from "better-auth";

interface InferenceLocals {
  session?: Session | null;
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
};
