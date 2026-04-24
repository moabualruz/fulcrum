import { describe, expect, it } from 'vitest'
import { estimateContextTokens, packContext } from '../retrieval/context-pack.js'
import type { TypedContextResult } from '../retrieval/search-context.js'

function result(input: Partial<TypedContextResult> & { type: TypedContextResult['type']; id: string; snippet: string; score: number }): TypedContextResult {
  return {
    type: input.type,
    rank: input.rank ?? 1,
    score: input.score,
    title: input.title ?? input.id,
    snippet: input.snippet,
    source_ref: { source_id: input.id },
    provenance_class: input.provenance_class ?? 'curated_backed',
    freshness: input.freshness ?? 'current',
    stage_contributions: input.stage_contributions ?? [{ stage: 'lexical', rank: 1, score: input.score }],
    explanation_status: input.explanation_status ?? 'complete',
  }
}

describe('context packing', () => {
  it('deduplicates sources, preserves source diversity, and respects token budget', () => {
    const packed = packContext([
      result({ type: 'memory', id: 'same', snippet: 'alpha '.repeat(12), score: 0.9 }),
      result({ type: 'memory', id: 'same', snippet: 'duplicate '.repeat(12), score: 0.8 }),
      result({ type: 'code_chunk', id: 'code', snippet: 'code '.repeat(12), score: 0.7 }),
      result({ type: 'task', id: 'task', snippet: 'task '.repeat(12), score: 0.6 }),
    ], 35)

    expect(packed.results.map(item => item.source_ref.source_id)).toEqual(['same', 'code'])
    expect(packed.deduplicated_results).toBe(1)
    expect(packed.truncated_results).toBe(1)
    expect(packed.source_diversity).toMatchObject({ memory: 1, code_chunk: 1 })
    expect(packed.budget.used_tokens).toBeLessThanOrEqual(35)
  })

  it('uses a conservative token estimate for long strings without whitespace', () => {
    const longDenseSnippet = 'a'.repeat(120)
    expect(estimateContextTokens({ title: 'dense', snippet: longDenseSnippet })).toBeGreaterThan(20)

    const packed = packContext([
      result({ type: 'memory', id: 'dense', snippet: longDenseSnippet, score: 0.9 }),
    ], 20)

    expect(packed.results).toHaveLength(1)
    expect(packed.results[0]?.snippet.length).toBeLessThan(longDenseSnippet.length)
    expect(packed.budget.used_tokens).toBeLessThanOrEqual(20)
    expect(packed.truncated_results).toBe(1)
  })
})
