import { describe, it, expect } from 'vitest'
import { diversifyByFile, calibrateScores } from '../retrieval/search.js'
import { rrfFuse } from '../code-context.js'
import type { CompactMemory } from '../types.js'

function mem(memory_id: string, recall_score: number, file_path: string | null = null): CompactMemory {
  return {
    memory_id,
    title: memory_id,
    summary: '',
    scope: 'project',
    kind: 'decision',
    file_path,
    confidence: 1,
    recall_score,
  }
}

// ─── diversifyByFile ─────────────────────────────────────────────────────────

describe('diversifyByFile', () => {
  it('returns all when no file_paths set', () => {
    const items = [mem('a', 0.9), mem('b', 0.8), mem('c', 0.7)]
    expect(diversifyByFile(items, 2)).toHaveLength(3)
  })

  it('caps at max_per_file per unique file_path', () => {
    const items = [
      mem('a', 0.9, 'src/foo.ts'),
      mem('b', 0.8, 'src/foo.ts'),
      mem('c', 0.7, 'src/foo.ts'),
      mem('d', 0.6, 'src/bar.ts'),
    ]
    const out = diversifyByFile(items, 2)
    const fooCount = out.filter(i => i.file_path === 'src/foo.ts').length
    const barCount = out.filter(i => i.file_path === 'src/bar.ts').length
    expect(fooCount).toBe(2)
    expect(barCount).toBe(1)
    expect(out).toHaveLength(3)
  })

  it('does not cap items with null file_path', () => {
    const items = [mem('a', 0.9), mem('b', 0.8), mem('c', 0.7), mem('d', 0.6)]
    expect(diversifyByFile(items, 1)).toHaveLength(4)
  })

  it('preserves order within cap', () => {
    const items = [
      mem('first', 0.9, 'f.ts'),
      mem('second', 0.8, 'f.ts'),
      mem('third', 0.7, 'f.ts'),
    ]
    const out = diversifyByFile(items, 2)
    expect(out.map(i => i.memory_id)).toEqual(['first', 'second'])
  })

  it('handles empty input', () => {
    expect(diversifyByFile([], 3)).toEqual([])
  })
})

// ─── calibrateScores ─────────────────────────────────────────────────────────

describe('calibrateScores', () => {
  it('returns empty array unchanged', () => {
    expect(calibrateScores([])).toEqual([])
  })

  it('all calibrated scores are in [0, 1]', () => {
    const items = [mem('a', 0.95), mem('b', 0.5), mem('c', 0.1), mem('d', 0.0)]
    const out = calibrateScores(items)
    for (const item of out) {
      expect(item.recall_score!).toBeGreaterThanOrEqual(0)
      expect(item.recall_score!).toBeLessThanOrEqual(1)
    }
  })

  it('single item gets score 1 (max-min range=0 branch)', () => {
    const out = calibrateScores([mem('solo', 0.3)])
    expect(out[0]!.recall_score).toBe(1)
  })

  it('relative ordering is preserved after normalization', () => {
    const items = [mem('high', 0.9), mem('mid', 0.5), mem('low', 0.1)]
    const out = calibrateScores(items)
    expect(out[0]!.recall_score!).toBeGreaterThan(out[1]!.recall_score!)
    expect(out[1]!.recall_score!).toBeGreaterThan(out[2]!.recall_score!)
  })
})

// ─── rrfFuse ─────────────────────────────────────────────────────────────────

describe('rrfFuse', () => {
  it('returns empty array for empty input', () => {
    expect(rrfFuse([])).toEqual([])
  })

  it('single-path result passes through with score', () => {
    const out = rrfFuse([[{ id: 'x', data: { value: 1 } }]])
    expect(out).toHaveLength(1)
    expect(out[0]!.id).toBe('x')
    expect(out[0]!.score).toBeGreaterThan(0)
  })

  it('item appearing in multiple paths scores higher than single-path item', () => {
    const pathA = [
      { id: 'shared', data: {} },
      { id: 'only_a', data: {} },
    ]
    const pathB = [
      { id: 'shared', data: {} },
    ]
    const out = rrfFuse([pathA, pathB])
    const sharedScore = out.find(r => r.id === 'shared')!.score
    const onlyAScore = out.find(r => r.id === 'only_a')!.score
    expect(sharedScore).toBeGreaterThan(onlyAScore)
  })

  it('deduplicates items that appear in multiple paths', () => {
    const pathA = [{ id: 'dup', data: { from: 'a' } }]
    const pathB = [{ id: 'dup', data: { from: 'b' } }]
    const out = rrfFuse([pathA, pathB])
    const dups = out.filter(r => r.id === 'dup')
    expect(dups).toHaveLength(1)
  })

  it('result is sorted descending by score', () => {
    const pathA = [
      { id: 'a', data: {} },
      { id: 'b', data: {} },
      { id: 'c', data: {} },
    ]
    const pathB = [
      { id: 'b', data: {} },
    ]
    const out = rrfFuse([pathA, pathB])
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1]!.score).toBeGreaterThanOrEqual(out[i]!.score)
    }
  })

  it('data from first-seen path is preserved for duplicates', () => {
    const pathA = [{ id: 'x', data: { canonical: true } }]
    const pathB = [{ id: 'x', data: { canonical: false } }]
    const out = rrfFuse([pathA, pathB])
    expect((out[0]!.data as { canonical: boolean }).canonical).toBe(true)
  })
})
