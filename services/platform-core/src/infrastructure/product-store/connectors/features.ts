/**
 * Feature-flag check for gated connectors.
 * Reads comma-separated feature names from FULCRUM_FEATURES env var.
 */
export function isFeatureEnabled(feature: string): boolean {
  const raw = process.env["FULCRUM_FEATURES"] ?? "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean).includes(feature);
}

export class FeatureDisabledError extends Error {
  constructor(feature: string) {
    super(`Feature '${feature}' is not enabled. Set FULCRUM_FEATURES=${feature} to enable.`);
    this.name = "FeatureDisabledError";
  }
}
