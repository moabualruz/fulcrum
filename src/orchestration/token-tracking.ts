/**
 * Token tracking: parse agent stdout for token-count lines using profile's
 * tokenCountPattern regex. Gated by FULCRUM_FEATURES=token-tracking.
 */

export interface TokenTracker {
  /** Feed a line of stdout; returns tokens parsed (0 if no match). */
  parseLine(line: string): number;
  /** Accumulated token count across all parsed lines. */
  readonly total: number;
}

/**
 * Create a TokenTracker from a profile's tokenCountPattern.
 * Pattern capture groups: group 1 = input tokens, group 2 = output tokens.
 * Total = sum of both. If pattern is undefined, every parseLine returns 0.
 */
export function createTokenTracker(pattern?: string): TokenTracker {
  const regex = pattern ? new RegExp(pattern) : null;
  let total = 0;

  return {
    parseLine(line: string): number {
      if (!regex) return 0;
      const match = regex.exec(line);
      if (!match) return 0;
      const input = Number(match[1] ?? 0);
      const output = Number(match[2] ?? 0);
      const count = input + output;
      total += count;
      return count;
    },
    get total() {
      return total;
    },
  };
}

/**
 * Check whether the token-tracking feature flag is enabled.
 */
export function isTokenTrackingEnabled(features?: string): boolean {
  return parseFlags(features).has("token-tracking");
}

function parseFlags(features?: string): Set<string> {
  if (!features) return new Set();
  return new Set(
    features
      .split(",")
      .map((f) => f.trim().split(":")[0]?.toLowerCase())
      .filter(Boolean) as string[],
  );
}
