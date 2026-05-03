/**
 * InferenceClient — selects backend via FULCRUM_INFERENCE_BACKEND env
 * + per-feature qualifier from FULCRUM_FEATURES (e.g. "embeddings:ollama").
 */
import type {
  BackendId,
  InferenceBackend,
  InferenceFeature,
} from "./types.ts";
import { BACKEND_IDS } from "./types.ts";
import { EmbeddedBackend } from "./embedded.ts";
import { OllamaBackend } from "./ollama.ts";
import { LmStudioBackend } from "./lm-studio.ts";
import { OpenAICompatibleBackend } from "./openai-compatible.ts";

export interface BackendInfo {
  readonly id: BackendId;
  readonly available: boolean;
  readonly requiredFlag?: string;
}

export class InferenceClient {
  private readonly globalDefault: BackendId;
  private readonly featureMap: ReadonlyMap<string, BackendId>;
  private readonly enabledFlags: ReadonlySet<string>;

  constructor() {
    const envBackend = process.env["FULCRUM_INFERENCE_BACKEND"];
    this.globalDefault = isValidBackendId(envBackend) ? envBackend : "embedded";

    const features = process.env["FULCRUM_FEATURES"] ?? "";
    const fMap = new Map<string, BackendId>();
    const flags = new Set<string>();

    for (const token of features.split(",").map((s) => s.trim()).filter(Boolean)) {
      // "embeddings:ollama" → feature=embeddings, backend=ollama
      const colonIdx = token.indexOf(":");
      if (colonIdx > 0) {
        const feature = token.slice(0, colonIdx);
        const backend = token.slice(colonIdx + 1);
        if (isValidBackendId(backend)) {
          fMap.set(feature, backend);
          flags.add(token);
          flags.add(feature);
        }
      } else {
        // bare flag like "external-llm-provider"
        flags.add(token);
      }
    }

    this.featureMap = fMap;
    this.enabledFlags = flags;
  }

  /** Resolve which backend ID to use, optionally for a specific feature. */
  resolveBackendId(feature?: InferenceFeature | string): BackendId {
    if (feature && this.featureMap.has(feature)) {
      return this.featureMap.get(feature)!;
    }
    return this.globalDefault;
  }

  /** Resolve and instantiate the backend for a given feature (or global default). */
  resolveBackend(feature?: InferenceFeature | string): InferenceBackend {
    return createBackend(this.resolveBackendId(feature));
  }

  /** Check if a backend is enabled (by env or feature flags). */
  isEnabled(id: BackendId): boolean {
    // embedded always available
    if (id === "embedded") return true;

    // if global default matches, it's enabled
    if (this.globalDefault === id) return true;

    // openai-compatible requires explicit external-llm-provider flag
    if (id === "openai-compatible") {
      return this.enabledFlags.has("external-llm-provider");
    }

    // ollama / lm-studio enabled if any feature qualifier references them
    for (const backend of this.featureMap.values()) {
      if (backend === id) return true;
    }
    return false;
  }

  /** List all backends with availability info. */
  listBackends(): readonly BackendInfo[] {
    return BACKEND_IDS.map((id) => ({
      id,
      available: this.isEnabled(id),
      requiredFlag: requiredFlag(id),
    }));
  }
}

function createBackend(id: BackendId): InferenceBackend {
  switch (id) {
    case "embedded":
      return new EmbeddedBackend();
    case "ollama":
      return new OllamaBackend();
    case "lm-studio":
      return new LmStudioBackend();
    case "openai-compatible":
      return new OpenAICompatibleBackend();
  }
}

function requiredFlag(id: BackendId): string | undefined {
  switch (id) {
    case "openai-compatible":
      return "external-llm-provider";
    case "ollama":
      return "embeddings:ollama";
    case "lm-studio":
      return "embeddings:lm-studio";
    default:
      return undefined;
  }
}

function isValidBackendId(val: string | undefined): val is BackendId {
  return BACKEND_IDS.includes(val as BackendId);
}
