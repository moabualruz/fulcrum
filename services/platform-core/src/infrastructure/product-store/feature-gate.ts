/**
 * Feature gate: parse FULCRUM_FEATURES env var (comma-separated list).
 * When a feature is OFF (not listed), gated operations throw FeatureGatedError.
 */

export class FeatureGatedError extends Error {
  readonly code = "FEATURE_GATED" as const;
  readonly feature: string;

  constructor(feature: string) {
    super(
      `Feature "${feature}" is not enabled. ` +
      `Set FULCRUM_FEATURES=${feature} to enable it.`,
    );
    this.name = "FeatureGatedError";
    this.feature = feature;
  }
}

export function isFeatureEnabled(feature: string): boolean {
  const raw = process.env.FULCRUM_FEATURES ?? "";
  if (!raw.trim()) return false;
  const features = raw.split(",").map((f) => f.trim()).filter(Boolean);
  return features.includes(feature);
}

export function assertFeatureEnabled(feature: string): void {
  if (!isFeatureEnabled(feature)) {
    throw new FeatureGatedError(feature);
  }
}
