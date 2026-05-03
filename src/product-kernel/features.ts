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

export const parseFeatureFlags = parseFeatures;

/**
 * Check whether a feature is enabled.
 *
 * Supports both explicit parsed flags (`isFeatureEnabled(flags, name)`) and
 * env-style checks (`isFeatureEnabled(name, rawEnv?)`) while older call sites
 * converge on one form.
 */
export function isFeatureEnabled(flags: readonly FeatureFlag[], name: string): boolean;
export function isFeatureEnabled(name: string, raw?: string): boolean;
export function isFeatureEnabled(name: string, flags: readonly FeatureFlag[]): boolean;
export function isFeatureEnabled(
  flagsOrName: readonly FeatureFlag[] | string,
  nameOrRaw?: string | readonly FeatureFlag[],
): boolean {
  if (Array.isArray(flagsOrName)) {
    return flagsOrName.some((f) => f.name === nameOrRaw);
  }

  const flags = typeof nameOrRaw === "string" || nameOrRaw === undefined
    ? parseFeatures(nameOrRaw ?? process.env.FULCRUM_FEATURES)
    : nameOrRaw;
  return flags.some((f) => f.name === flagsOrName);
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

export function _resetFeatureCache(): void {
  // Compatibility hook for tests; this module currently reads env eagerly.
}
