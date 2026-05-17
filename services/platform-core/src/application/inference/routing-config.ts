/**
 * In-memory per-feature backend routing config store.
 *
 * WHY in-memory: config changes take effect without restart (AC requirement).
 * Seeded from FULCRUM_FEATURES env on first access; mutated via tRPC/CLI.
 * Future: persist to the platform configuration store.
 */

import type { BackendId, InferenceFeature } from "./backends/types.ts";
import { BACKEND_IDS } from "./backends/types.ts";
import {
  DEFAULT_FEATURE_BACKEND_MAP,
  type FeatureBackendMap,
  type InferenceFeatureKey,
} from "./protocol.ts";

let _map: FeatureBackendMap | null = null;

function seedFromEnv(): FeatureBackendMap {
  const map: FeatureBackendMap = { ...DEFAULT_FEATURE_BACKEND_MAP };
  const features = process.env["FULCRUM_FEATURES"] ?? "";
  for (const token of features.split(",").map((s) => s.trim()).filter(Boolean)) {
    const colonIdx = token.indexOf(":");
    if (colonIdx > 0) {
      const feature = token.slice(0, colonIdx) as InferenceFeatureKey;
      const backend = token.slice(colonIdx + 1);
      if (BACKEND_IDS.includes(backend as BackendId)) {
        map[feature] = backend as BackendId;
      }
    }
  }
  return map;
}

/** Get the current routing map (lazy-seeded from env on first call). */
export function getRoutingConfig(): Readonly<FeatureBackendMap> {
  if (!_map) _map = seedFromEnv();
  return _map;
}

/** Set backend for a single feature. */
export function setRoutingConfig(feature: InferenceFeatureKey, backend: BackendId): void {
  if (!_map) _map = seedFromEnv();
  _map[feature] = backend;
}

/** Replace entire map (for testing). */
export function replaceRoutingConfig(map: FeatureBackendMap): void {
  _map = { ...map };
}

/** Reset to null so next getRoutingConfig() re-seeds from env (for testing). */
export function resetRoutingConfig(): void {
  _map = null;
}

/**
 * Resolve which backend to use for a feature.
 * Qualifier chain: explicit map entry -> global FULCRUM_INFERENCE_BACKEND env -> "embedded".
 */
export function selectBackend(feature?: InferenceFeature | string): BackendId {
  const map = getRoutingConfig();
  if (feature && feature in map) {
    return map[feature as InferenceFeatureKey]!;
  }
  const envBackend = process.env["FULCRUM_INFERENCE_BACKEND"];
  if (envBackend && BACKEND_IDS.includes(envBackend as BackendId)) {
    return envBackend as BackendId;
  }
  return "embedded";
}
