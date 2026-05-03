/**
 * flags module barrel — re-exports the public API.
 *
 * Consumers import from "src/flags" (not from the internal registry file directly).
 *
 * Web flags page, CLI flags command, and TUI flags screen all consume:
 *   - FlagRegistry (singleton service)
 *   - FEATURE_FLAGS (tuple of all flag names)
 *   - FLAG_DESCRIPTIONS (human-readable descriptions)
 *   - FeatureFlagName (union type)
 */

export {
  FlagRegistry,
  FEATURE_FLAGS,
  FLAG_DESCRIPTIONS,
  type FeatureFlagName,
} from "./registry.ts";
export {
  bucketFor,
  evaluateFeatureFlag,
  normalizeRolloutPercent,
  type EvaluateFeatureFlagInput,
  type FeatureFlagEvaluationConfig,
} from "./evaluation.ts";
export {
  ExperimentStore,
  experimentStore,
  type Experiment,
  type ExperimentAssignment,
  type AssignmentCounts,
  type MetricsResult,
} from "./experiments.ts";

/**
 * Env-var feature gate: checks FULCRUM_FEATURES for a token.
 * Used by TUI screens and other lightweight callers that don't need the full
 * FlagRegistry (which requires DB context).
 */
export function isEnabled(
  name: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env["FULCRUM_FEATURES"] ?? "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean).includes(name);
}

export function resetFeaturesCache(): void {
  // No-op — env is re-read each call. Kept for test compat.
}
