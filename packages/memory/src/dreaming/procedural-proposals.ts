// v2b PR 11 Task 2.3 — procedural memory proposal detection.
//
// Detects recurring (decision → file_patch) patterns across sessions.
// Proposals are human-review-only; no auto-promotion.

export interface MemorySequence {
  memory_id: string
  slug: string
  kind: string
  session_id: string
}

export interface ProceduralProposal {
  pattern: string      // e.g. "decision+file_patch"
  slug: string         // filename-safe identifier
  occurrences: number
  sessionIds: string[]
}

const MIN_OCCURRENCES = 3

export function detectProceduralPatterns(
  sessions: MemorySequence[][]
): ProceduralProposal[] {
  // Count how many sessions exhibit each consecutive (kind_a → kind_b) pattern
  const patternCounts = new Map<string, string[]>()  // pattern → sessionIds

  for (const seq of sessions) {
    const seenPatternsThisSession = new Set<string>()
    for (let i = 0; i < seq.length - 1; i++) {
      const a = seq[i]!.kind
      const b = seq[i + 1]!.kind
      const key = `${a}+${b}`
      if (!seenPatternsThisSession.has(key)) {
        seenPatternsThisSession.add(key)
        if (!patternCounts.has(key)) patternCounts.set(key, [])
        patternCounts.get(key)!.push(seq[i]!.session_id)
      }
    }
  }

  const proposals: ProceduralProposal[] = []
  for (const [pattern, sessionIds] of patternCounts) {
    if (sessionIds.length >= MIN_OCCURRENCES) {
      proposals.push({
        pattern,
        slug: pattern.replace(/[^a-z0-9+]/gi, '_').toLowerCase(),
        occurrences: sessionIds.length,
        sessionIds,
      })
    }
  }
  return proposals
}
