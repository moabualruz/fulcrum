/**
 * Feature-flag parser for FULCRUM_FEATURES env var.
 * Per D5: lowercase-with-hyphens, comma-separated.
 */
export function parseFeatures(env?: string): ReadonlySet<string> {
  if (!env) return new Set();
  return new Set(
    env
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isFeatureEnabled(flag: string, env?: string): boolean {
  return parseFeatures(env ?? process.env.FULCRUM_FEATURES).has(flag);
}
