/**
 * Token tracking: parse agent stdout for token-count lines using profile's
 * tokenCountPattern regex. Gated by FULCRUM_FEATURES=token-tracking.
 *
 * Also exports TokenUsageAggregator for cumulative Codex app-server token
 * accounting keyed by thread_id (SYM-22, D-22).
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

// ---------------------------------------------------------------------------
// TokenUsageAggregator — cumulative accounting from thread/tokenUsage/updated
// ---------------------------------------------------------------------------

export interface TokenUsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Tracks cumulative token totals per thread_id from Codex app-server
 * `thread/tokenUsage/updated` events.
 *
 * Design (D-22): each event carries a cumulative absolute total for the thread.
 * We REPLACE (not add) the stored total on each update to avoid double-counting.
 * grandTotal() sums the latest stored total across all threads.
 */
export class TokenUsageAggregator {
  /** Latest cumulative snapshot per thread_id. */
  private readonly _threads = new Map<string, TokenUsageSnapshot>();

  /**
   * Update the cumulative total for a thread.
   * Replaces the previous value — never adds to it.
   */
  updateCumulative(threadId: string, usage: TokenUsageSnapshot): void {
    this._threads.set(threadId, { ...usage });
  }

  /** Latest cumulative total tokens for a specific thread_id (0 if unknown). */
  totalForThread(threadId: string): number {
    return this._threads.get(threadId)?.totalTokens ?? 0;
  }

  /** Sum of latest cumulative totals across all threads. */
  grandTotal(): number {
    let sum = 0;
    for (const snap of this._threads.values()) {
      sum += snap.totalTokens;
    }
    return sum;
  }

  /** All tracked thread snapshots (read-only view). */
  get threads(): ReadonlyMap<string, TokenUsageSnapshot> {
    return this._threads;
  }
}
