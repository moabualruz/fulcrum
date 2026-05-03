// Feature flags for gated Pillar 8 subsystems.
// Parse FULCRUM_FEATURES env var: comma-separated list of enabled features.
// No flag active when env unset — deterministic default.

export const PILLAR8_FLAGS = [
  "embeddings",
  "llm-extraction",
  "report-narration",
] as const;

export type Pillar8Flag = (typeof PILLAR8_FLAGS)[number];

export function parseFeatureFlags(env?: string): Set<Pillar8Flag> {
  if (!env) return new Set();
  const result = new Set<Pillar8Flag>();
  for (const raw of env.split(",")) {
    const trimmed = raw.trim() as Pillar8Flag;
    if ((PILLAR8_FLAGS as readonly string[]).includes(trimmed)) {
      result.add(trimmed);
    }
  }
  return result;
}

export function isFeatureEnabled(flag: Pillar8Flag, env?: string): boolean {
  return parseFeatureFlags(env ?? process.env["FULCRUM_FEATURES"]).has(flag);
}

export function activeFlags(): Set<Pillar8Flag> {
  return parseFeatureFlags(process.env["FULCRUM_FEATURES"]);
}
