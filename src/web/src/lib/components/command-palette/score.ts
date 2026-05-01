/**
 * Score a command-palette label against a user query.
 *
 * Returns a numeric score where higher is better. Tier order is strict:
 *
 * 1. Exact (case-insensitive)         → 1000
 * 2. Prefix (case-insensitive)        → 500 - min(label.length - query.length,
 *                                                  PREFIX_TAPER_MAX)
 *                                       shorter remainder ranks higher;
 *                                       remainder is clamped so prefix can
 *                                       never underflow into subsequence
 *                                       territory even on very long labels.
 * 3. Subsequence (chars in order)     → 100 + proximityBonus
 *                                       proximity = sum over adjacent
 *                                       matched query-chars of
 *                                       (10 - gap), floored at 0,
 *                                       where gap = distance between their
 *                                       label positions − 1. Adjacent (gap
 *                                       0) gives the full +10, longer gaps
 *                                       diminish.
 * 4. Miss / empty query / empty label → 0.
 */

const EXACT = 1000;
const PREFIX_BASE = 500;
const PREFIX_TAPER_MAX = 99;
const SUBSEQUENCE_BASE = 100;
const PROXIMITY_MAX = 10;

export function scoreCommand(label: string, query: string): number {
  if (query.length === 0) return 0;
  if (label.length === 0) return 0;

  const lowerLabel = label.toLowerCase();
  const lowerQuery = query.toLowerCase();

  if (lowerLabel === lowerQuery) {
    return EXACT;
  }

  if (lowerLabel.startsWith(lowerQuery)) {
    const remainder = label.length - query.length;
    return PREFIX_BASE - Math.min(remainder, PREFIX_TAPER_MAX);
  }

  let labelIndex = 0;
  let bonus = 0;
  let lastMatchIndex = -1;
  for (let queryIndex = 0; queryIndex < lowerQuery.length; queryIndex++) {
    const ch = lowerQuery[queryIndex];
    let found = -1;
    while (labelIndex < lowerLabel.length) {
      if (lowerLabel[labelIndex] === ch) {
        found = labelIndex;
        labelIndex++;
        break;
      }
      labelIndex++;
    }
    if (found === -1) return 0;
    if (lastMatchIndex !== -1) {
      const gap = found - lastMatchIndex - 1;
      const reward = PROXIMITY_MAX - gap;
      if (reward > 0) bonus += reward;
    }
    lastMatchIndex = found;
  }

  return SUBSEQUENCE_BASE + bonus;
}
