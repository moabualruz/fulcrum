// v2a PR 5 Task 27 — query sanitizer (4-step escalation, sanitizer-escalation pattern).
//
// Applied at every recall entry point. Goal: a recall query coming in from
// an agent's chat may include the agent's whole prior turn or even an
// untrusted assistant output. We want the actual question, not the
// preamble.
//
// Steps:
//   1. Passthrough if clean (under cap and no obvious assistant-output markers)
//   2. Extract the trailing question if assistant-output markers are detected
//   3. Use the tail sentence if step 2 still leaves a long string
//   4. Hard-cap truncate the tail

const HARD_CAP = 800
const SOFT_CAP = 240

const ASSISTANT_OUTPUT_MARKERS_RE = /(?:^|\n)(?:assistant\s*:|<assistant>|assistant_output\s*=|<\|assistant\|>|^>>>?\s*assistant)/im

function lastSentence(s: string): string {
  const matches = s.split(/(?<=[.?!])\s+/)
  if (matches.length === 0) return s
  return matches[matches.length - 1]!
}

function tailQuestion(s: string): string | null {
  // Most natural: the trailing line ending in `?` is the question.
  // Strip a leading role label (e.g. "user:", "assistant:", ">>>", "<|user|>")
  // so the returned text is the question itself.
  const lines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]!.endsWith('?')) {
      return lines[i]!.replace(/^(?:<\|?[a-z_]+\|?>\s*|>>>?\s*|user\s*:|assistant\s*:|system\s*:)\s*/i, '')
    }
  }
  return null
}

export function sanitizeQuery(q: string): string {
  if (!q) return ''
  const trimmed = q.trim()

  // Step 1 — passthrough
  if (trimmed.length <= SOFT_CAP && !ASSISTANT_OUTPUT_MARKERS_RE.test(trimmed)) {
    return trimmed
  }

  // Step 2 — extract a trailing question if assistant-output markers were found
  if (ASSISTANT_OUTPUT_MARKERS_RE.test(trimmed)) {
    const tq = tailQuestion(trimmed)
    if (tq && tq.length <= HARD_CAP) return tq
  }

  // Step 3 — fall back to the tail sentence
  const tail = lastSentence(trimmed).trim()
  if (tail && tail.length <= HARD_CAP) return tail

  // Step 4 — hard-cap truncate from the tail (preserves the most-recent text)
  return trimmed.slice(-HARD_CAP)
}
