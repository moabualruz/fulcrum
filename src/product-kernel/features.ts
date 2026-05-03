/**
 * Feature flag registry — reads FULCRUM_FEATURES env var (comma-separated list).
 * Each gated extension checks its flag here.
 */

const KNOWN_FLAGS = [
  "real-time-collab-server",
  "symphony-ssh-worker",
  "symphony-http-api",
  "connector-linear",
  "router-llm",
  "saas-auth",
  "public-api",
] as const;

export type FeatureFlag = (typeof KNOWN_FLAGS)[number];

/** Parse FULCRUM_FEATURES env var into a Set of enabled flags. */
export function parseFeatureFlags(envValue?: string): Set<FeatureFlag> {
  if (!envValue) return new Set();
  const flags = new Set<FeatureFlag>();
  for (const raw of envValue.split(",")) {
    const trimmed = raw.trim() as FeatureFlag;
    if (KNOWN_FLAGS.includes(trimmed)) {
      flags.add(trimmed);
    }
  }
  return flags;
}

/** Check if a specific feature flag is enabled. */
export function isFeatureEnabled(
  flag: FeatureFlag,
  flags?: Set<FeatureFlag>,
): boolean {
  const active = flags ?? parseFeatureFlags(process.env.FULCRUM_FEATURES);
  return active.has(flag);
}
