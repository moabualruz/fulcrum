/**
 * Feature flags system for gated TUI features.
 * Flags controlled via FULCRUM_FEATURES env var (comma-separated).
 */

export type FeatureFlag =
  | "desktop-app"
  | "experiments"
  | "casbin-policies"
  | "scheduled-backups";

export const KNOWN_FLAGS: readonly FeatureFlag[] = [
  "desktop-app",
  "experiments",
  "casbin-policies",
  "scheduled-backups",
] as const;

const knownSet = new Set<string>(KNOWN_FLAGS);

/** Parse FULCRUM_FEATURES env into a set of valid flags. */
export function parseFeatureFlags(): Set<FeatureFlag> {
  const raw = process.env["FULCRUM_FEATURES"];
  if (!raw) return new Set();

  const result = new Set<FeatureFlag>();
  for (const token of raw.split(",")) {
    const trimmed = token.trim();
    if (trimmed && knownSet.has(trimmed)) {
      result.add(trimmed as FeatureFlag);
    }
  }
  return result;
}

/** Check if a specific flag is enabled. */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return parseFeatureFlags().has(flag);
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
