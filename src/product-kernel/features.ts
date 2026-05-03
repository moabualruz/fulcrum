/**
 * Feature-flag gate for optional capabilities that depend on external services.
 *
 * Flags are read from `FULCRUM_FEATURES` env var — comma-separated list.
 * Each flag may carry a backend hint after a colon:
 *   `embeddings,report-llm-narration:ollama`
 *
 * When a flag is absent, the gated path is skipped silently.
 */

export interface FeatureFlag {
  name: string;
  /** Optional backend hint, e.g. "ollama" or "openai-compatible". */
  backend: string | null;
}

/**
 * Parse `FULCRUM_FEATURES` env var into structured flags.
 */
export function parseFeatures(raw?: string): FeatureFlag[] {
  if (!raw || raw.trim() === "") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((token) => {
      const colon = token.indexOf(":");
      if (colon === -1) return { name: token, backend: null };
      return {
        name: token.slice(0, colon),
        backend: token.slice(colon + 1) || null,
      };
    });
}

/**
 * Check whether a feature is enabled.
 */
export function isFeatureEnabled(
  flags: readonly FeatureFlag[],
  name: string,
): boolean {
  return flags.some((f) => f.name === name);
}

/**
 * Get backend hint for a feature, or null.
 */
export function getFeatureBackend(
  flags: readonly FeatureFlag[],
  name: string,
): string | null {
  return flags.find((f) => f.name === name)?.backend ?? null;
}

/**
 * Read flags from env. Convenience for callers that don't want to thread `flags`.
 */
export function loadFeatures(): FeatureFlag[] {
  return parseFeatures(process.env.FULCRUM_FEATURES);
}
