// v2b PR 11 Task 2.0 — Dreaming light-phase tests.
// Validates dangling-link detection, B.4 threshold scoring, report output.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runLightPhase, type LightPhaseInput, type LightPhaseResult } from '../light-phase.js'

// Build a minimal memory row
function makeMemory(id: string, opts: Partial<{
  recall_count: number
  unique_query_count: number
  max_recall_score: number
  scope: string
}> = {}) {
  return {
    memory_id: id,
    slug: id,
    recall_count: opts.recall_count ?? 0,
    unique_query_count: opts.unique_query_count ?? 0,
    max_recall_score: opts.max_recall_score ?? 0.0,
    scope: opts.scope ?? 'short',
  }
}

// Build a wikilink row (dangling = dst_memory_id IS NULL)
function dangling(srcId: string, dstSlug: string) {
  return { src_memory_id: srcId, dst_slug: dstSlug, dst_memory_id: null }
}

describe('Dreaming light phase — v2b PR 11 Task 2.0', () => {
  it('identifies short-term memories with no incoming wikilinks as dangling', async () => {
    const input: LightPhaseInput = {
      memories: [makeMemory('m1'), makeMemory('m2')],
      wikilinks: [], // no links at all
      recallEvents: [],
    }
    const result = await runLightPhase(input)
    expect(result.danglingIds).toContain('m1')
    expect(result.danglingIds).toContain('m2')
  })

  it('does NOT flag a memory that has an incoming link', async () => {
    const input: LightPhaseInput = {
      memories: [makeMemory('m1'), makeMemory('m2')],
      // m1 has an incoming backlink from m2
      wikilinks: [{ src_memory_id: 'm2', dst_slug: 'm1', dst_memory_id: 'm1' }],
      recallEvents: [],
    }
    const result = await runLightPhase(input)
    expect(result.danglingIds).not.toContain('m1')
    expect(result.danglingIds).toContain('m2') // m2 has no incoming link
  })

  it('computes score using B.4 formula (α=0.4, β=0.4, γ=0.2)', async () => {
    // score = 0.4 * recall_count + 0.4 * unique_query_count + 0.2 * max_recall_score
    const mem = makeMemory('scored', { recall_count: 5, unique_query_count: 3, max_recall_score: 0.8 })
    const input: LightPhaseInput = { memories: [mem], wikilinks: [], recallEvents: [] }
    const result = await runLightPhase(input)
    const entry = result.scores.find(s => s.memory_id === 'scored')
    expect(entry).toBeDefined()
    // 0.4*5 + 0.4*3 + 0.2*0.8 = 2.0 + 1.2 + 0.16 = 3.36
    expect(entry!.score).toBeCloseTo(3.36)
  })

  it('produces a non-empty report string', async () => {
    const input: LightPhaseInput = {
      memories: [makeMemory('orphan')],
      wikilinks: [dangling('orphan', 'nonexistent')],
      recallEvents: [],
    }
    const result = await runLightPhase(input)
    expect(typeof result.report).toBe('string')
    expect(result.report.length).toBeGreaterThan(0)
  })

  it('includes dangling slug names in the report', async () => {
    const input: LightPhaseInput = {
      memories: [makeMemory('solo')],
      wikilinks: [],
      recallEvents: [],
    }
    const result = await runLightPhase(input)
    expect(result.report).toContain('solo')
  })
})
