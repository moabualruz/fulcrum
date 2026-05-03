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
