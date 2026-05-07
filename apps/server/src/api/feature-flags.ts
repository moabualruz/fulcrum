/**
 * Shared feature-flag check for the public REST API.
 * Single source of truth — all API surfaces import from here.
 */

/**
 * Check whether `flag` is enabled in FULCRUM_FEATURES env var.
 * Re-reads env per call so flag toggles take effect without restart.
 */
export function isFeatureEnabled(flag: string): boolean {
  return (process.env["FULCRUM_FEATURES"] ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean)
    .includes(flag);
}

/** Check the `public-api` feature flag. */
export function isPublicApiEnabled(): boolean {
  return isFeatureEnabled("public-api");
}
