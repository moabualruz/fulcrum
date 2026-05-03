// Feature flag gate — reads FULCRUM_FEATURES env var (comma-separated list).
// C1: build everything, gate online behind FULCRUM_FEATURES, default OFF.

/**
 * Returns true if `name` is present in the FULCRUM_FEATURES env var.
 * FULCRUM_FEATURES is a comma-separated list of enabled feature names.
 * Default: all features OFF.
 */
export function isFeatureEnabled(name: string): boolean {
  const raw = process.env["FULCRUM_FEATURES"] ?? "";
  if (!raw.trim()) return false;
  return raw.split(",").map((s) => s.trim()).includes(name);
}

/** Throws a formatted error if feature is not enabled. */
export function assertFeatureEnabled(name: string): void {
  if (!isFeatureEnabled(name)) {
    throw new Error(`Feature ${name} not enabled`);
  }
}
