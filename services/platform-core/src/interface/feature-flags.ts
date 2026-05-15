export {
  FEATURE_FLAGS,
  FLAG_DESCRIPTIONS,
  isEnvFeatureEnabled,
  isRegisteredFeatureFlag,
  parseEnvFeatureFlags,
} from "@platform-core/application/feature-flags/registry.ts";
export type { FeatureFlagName } from "@platform-core/application/feature-flags/registry.ts";
export { isEnabled } from "@platform-core/application/feature-flags/index.ts";
export type {
  AssignmentCounts,
  MetricsResult,
} from "@platform-core/application/feature-flags/experiments.ts";
