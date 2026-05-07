import {
  FEATURE_FLAGS,
  isEnvFeatureEnabled,
  isRegisteredFeatureFlag,
  parseEnvFeatureFlags,
  type FeatureFlagName,
} from "@/flags/registry.ts";

export type FeatureFlag = FeatureFlagName;

export const KNOWN_FLAGS: readonly FeatureFlag[] = FEATURE_FLAGS;

/** Parse FULCRUM_FEATURES env into a set of valid flags. */
export function parseFeatureFlags(): Set<FeatureFlag> {
  return parseEnvFeatureFlags();
}

/** Check if a specific flag is enabled. */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return isEnvFeatureEnabled(flag);
}

/** Enable or disable a flag, updating FULCRUM_FEATURES env. */
export function setFeatureFlag(flag: FeatureFlag, enabled: boolean): void {
  const current = parseFeatureFlags();
  if (enabled) {
    current.add(flag);
  } else {
    current.delete(flag);
  }
  if (current.size === 0) {
    delete process.env["FULCRUM_FEATURES"];
  } else {
    process.env["FULCRUM_FEATURES"] = [...current].join(",");
  }
}

/** Return sorted array of currently enabled flags. */
export function getEnabledFeatures(): FeatureFlag[] {
  return [...parseFeatureFlags()].sort();
}

export function isKnownFeatureFlag(flag: string): flag is FeatureFlag {
  return isRegisteredFeatureFlag(flag);
}
