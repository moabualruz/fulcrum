/**
 * Feature flag check via FULCRUM_FEATURES env var.
 * Comma-separated list of enabled feature slugs.
 */
export function isFeatureEnabled(feature: string): boolean {
  const raw = process.env.FULCRUM_FEATURES ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(feature);
}
