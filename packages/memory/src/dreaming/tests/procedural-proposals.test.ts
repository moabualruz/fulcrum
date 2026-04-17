// v2b PR 11 Task 2.3 — procedural memory proposal tests.

import { describe, it, expect } from 'vitest'
import { detectProceduralPatterns, type MemorySequence } from '../procedural-proposals.js'

function makeSeq(kind: string, i: number): MemorySequence {
  return { memory_id: `m${kind}${i}`, slug: `m${kind}${i}`, kind, session_id: `session_${i}` }
}

describe('procedural-memory proposals — v2b PR 11 Task 2.3', () => {
  it('detects a recurring decision+file_patch pattern after ≥3 occurrences', () => {
    // Simulate 3 sessions each having decision then file_patch
    const sequences: MemorySequence[][] = [
      [makeSeq('decision', 1), makeSeq('file_patch', 1)],
      [makeSeq('decision', 2), makeSeq('file_patch', 2)],
      [makeSeq('decision', 3), makeSeq('file_patch', 3)],
    ]
    const proposals = detectProceduralPatterns(sequences)
    expect(proposals.length).toBeGreaterThan(0)
    const p = proposals[0]!
    expect(p.pattern).toContain('decision')
    expect(p.pattern).toContain('file_patch')
    expect(p.occurrences).toBeGreaterThanOrEqual(3)
  })

  it('does NOT propose for patterns that occur only twice', () => {
    const sequences: MemorySequence[][] = [
      [makeSeq('decision', 1), makeSeq('file_patch', 1)],
      [makeSeq('decision', 2), makeSeq('file_patch', 2)],
    ]
    const proposals = detectProceduralPatterns(sequences)
    expect(proposals).toHaveLength(0)
  })

  it('each proposal has a slug field for the output filename', () => {
    const sequences: MemorySequence[][] = [
      [makeSeq('decision', 1), makeSeq('file_patch', 1)],
      [makeSeq('decision', 2), makeSeq('file_patch', 2)],
      [makeSeq('decision', 3), makeSeq('file_patch', 3)],
    ]
    const proposals = detectProceduralPatterns(sequences)
    expect(proposals[0]!.slug).toBeDefined()
    expect(typeof proposals[0]!.slug).toBe('string')
  })
})
