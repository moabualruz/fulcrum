/**
 * Inference backends — barrel export.
 */
export type {
  InferenceBackend,
  BackendId,
  FeatureQualifier,
  InferenceFeature,
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
export { BACKEND_IDS } from "./types.ts";
export { EmbeddedBackend } from "./embedded.ts";
export { OllamaBackend } from "./ollama.ts";
export { LmStudioBackend } from "./lm-studio.ts";
export { OpenAICompatibleBackend } from "./openai-compatible.ts";
export { InferenceClient } from "./client.ts";
export type { BackendInfo } from "./client.ts";
export {
  getRoutingConfig,
  setRoutingConfig,
  selectBackend,
  resetRoutingConfig,
  replaceRoutingConfig,
} from "../routing-config.ts";
