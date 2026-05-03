/**
 * InferenceClient — selects backend via per-feature routing config
 * (read at call time, not startup) with qualifier chain:
 * explicit map entry -> FULCRUM_INFERENCE_BACKEND env -> "embedded".
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
import {
  selectBackend,
  getRoutingConfig,
} from "../routing-config.ts";

export interface BackendInfo {
  readonly id: BackendId;
  readonly available: boolean;
  readonly requiredFlag?: string;
}

export class InferenceClient {
  /**
   * Resolve which backend ID to use for a feature.
   * Reads routing config at call time so config changes take effect without restart.
   */
  resolveBackendId(feature?: InferenceFeature | string): BackendId {
    return selectBackend(feature);
  }

  /** Resolve and instantiate the backend for a given feature (or global default). */
  resolveBackend(feature?: InferenceFeature | string): InferenceBackend {
    return createBackend(this.resolveBackendId(feature));
  }

  /** Check if a backend is enabled (routing map references it, or env/flag enables it). */
  isEnabled(id: BackendId): boolean {
    if (id === "embedded") return true;

    // Check if global env default matches
    const envBackend = process.env["FULCRUM_INFERENCE_BACKEND"];
    if (envBackend === id) return true;

    // openai-compatible requires explicit external-llm-provider flag
    if (id === "openai-compatible") {
      return enabledFlags().has("external-llm-provider");
    }

    // Check if any feature in the routing map references this backend
    const map = getRoutingConfig();
    for (const backend of Object.values(map)) {
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

function enabledFlags(): ReadonlySet<string> {
  const features = process.env["FULCRUM_FEATURES"] ?? "";
  const flags = new Set<string>();
  for (const token of features.split(",").map((s) => s.trim()).filter(Boolean)) {
    const colonIdx = token.indexOf(":");
    if (colonIdx > 0) {
      flags.add(token);
      flags.add(token.slice(0, colonIdx));
    } else {
      flags.add(token);
    }
  }
  return flags;
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
      return new OpenAICompatibleBackend({
        flagEnabled: enabledFlags().has("external-llm-provider"),
      });
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
