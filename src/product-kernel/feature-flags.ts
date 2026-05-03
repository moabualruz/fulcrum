/**
 * Feature flags gated by FULCRUM_FEATURES environment variable.
 * Comma-separated list: FULCRUM_FEATURES=embeddings,other-flag
 */

let _cache: Set<string> | null = null;

function activeFlags(): Set<string> {
  if (_cache) return _cache;
  const raw = process.env["FULCRUM_FEATURES"] ?? "";
  _cache = new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return _cache;
}

export function isFeatureEnabled(flag: string): boolean {
  return activeFlags().has(flag.toLowerCase());
}

export function embeddingsEnabled(): boolean {
  return isFeatureEnabled("embeddings");
}

/** Reset cache — for testing only. */
export function _resetFlagCache(): void {
  _cache = null;
}
