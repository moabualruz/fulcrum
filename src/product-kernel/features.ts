/**
 * Feature flags parsed from FULCRUM_FEATURES env var.
 * Comma-separated list of feature names, e.g. "connector-github,beta-ui".
 */

const KNOWN_FEATURES = ["connector-github", "connector-gitlab"] as const;
export type FeatureName = (typeof KNOWN_FEATURES)[number];

let _cache: Set<string> | null = null;

function parseFeatures(): Set<string> {
  if (_cache) return _cache;
  const raw = process.env.FULCRUM_FEATURES ?? "";
  _cache = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return _cache;
}

export function isFeatureEnabled(name: FeatureName): boolean {
  return parseFeatures().has(name);
}

/** Reset cache — for testing only. */
export function _resetFeatureCache(): void {
  _cache = null;
}
