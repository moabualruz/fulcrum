// packages/memory/src/tests/recall-reranker.test.ts
//
// Verifies reranker wiring in recallMemory:
// - recall_score is populated from reranker scores when reranker is active
// - recall_score falls back to RRF score when reranker is absent
// - higher-relevance passage receives a higher recall_score

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-core'
import { writeMemory } from '../write.js'
import { recallMemory } from '../recall.js'
import type { CompactMemory } from '../types.js'

// Mock the reranker so tests don't load ONNX model
vi.mock('fulcrum-core', async () => {
  const actual = await vi.importActual<typeof import('fulcrum-core')>('fulcrum-core')
  return {
    ...actual,
    getReranker: vi.fn().mockReturnValue(null),  // default: no reranker
  }
})

beforeEach(() => { createTestDb() })
afterEach(() => {
  resetTestDb()
  vi.restoreAllMocks()
})

function seed() {
  const db = getDb()
  seedWorkspaceAndProject(db, 'ws_1', 'proj_1')
}

describe('reranker wiring in recallMemory (Task 24)', () => {
  it('recall_score is populated (non-undefined) in compact results', async () => {
    seed()
    await writeMemory({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      content: 'canine companion sitting on floor mat',
      title: 'dog on mat',
      summary: 'dog on mat',
      scope: 'project',
      kind: 'fact',
      tags: [],
    })

    const results = await recallMemory({
      query: 'dog sitting on mat',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      mode: 'compact',
    }) as CompactMemory[]

    expect(results.length).toBeGreaterThan(0)
    // recall_score is populated (may be 0 for low-relevance, but not undefined)
    expect(results[0].recall_score).toBeDefined()
    expect(typeof results[0].recall_score).toBe('number')
  })

  it('uses reranker scores when reranker is available', async () => {
    seed()

    // Both memories share the word "memory" so FTS5 retrieves both
    const highRelevantId = (await writeMemory({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      content: 'memory store for dog breed information and canine health records',
      title: 'dog memory',
      summary: 'dog memory',
      scope: 'project',
      kind: 'fact',
      tags: [],
    })).memory_id

    const lowRelevantId = (await writeMemory({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      content: 'memory store for quantum physics experiments and superconducting circuits',
      title: 'physics memory',
      summary: 'physics memory',
      scope: 'project',
      kind: 'fact',
      tags: [],
    })).memory_id

    // Mock reranker: passage 0 (as returned by FTS5 order) gets 0.95, passage 1 gets 0.05
    // After reranking, the 0.95 passage should be first
    const { getReranker } = await import('fulcrum-core')
    vi.mocked(getReranker).mockReturnValue({
      rerank: vi.fn().mockImplementation((_q: string, passages: string[]) => {
        // Return high score for the passage containing 'dog', low for 'quantum'
        return Promise.resolve(passages.map(p => p.includes('dog') ? 0.95 : 0.05))
      }),
      warmUp: vi.fn(),
    })

    const results = await recallMemory({
      query: 'memory store',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      mode: 'compact',
      limit: 10,
    }) as CompactMemory[]

    expect(results.length).toBeGreaterThanOrEqual(2)

    const highResult = results.find(r => r.memory_id === highRelevantId)
    const lowResult  = results.find(r => r.memory_id === lowRelevantId)

    // Both must have recall_score populated
    expect(highResult?.recall_score).toBeDefined()
    expect(lowResult?.recall_score).toBeDefined()

    // The reranker-scored result (dog) should be ranked first (0.95 > 0.05)
    expect(results[0].memory_id).toBe(highRelevantId)
    // Higher score for dog-related memory
    expect(highResult!.recall_score!).toBeGreaterThan(lowResult!.recall_score!)
  })

  it('falls back to RRF score when reranker returns non-finite values', async () => {
    seed()
    await writeMemory({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      content: 'machine learning model training pipeline',
      title: 'ml pipeline',
      summary: 'ml pipeline',
      scope: 'project',
      kind: 'fact',
      tags: [],
    })

    // Reranker returns NaN/Infinity — should fall back to RRF score
    const { getReranker } = await import('fulcrum-core')
    vi.mocked(getReranker).mockReturnValue({
      rerank: vi.fn().mockResolvedValue([NaN]),
      warmUp: vi.fn(),
    })

    const results = await recallMemory({
      query: 'machine learning',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      mode: 'compact',
    }) as CompactMemory[]

    expect(results.length).toBeGreaterThan(0)
    // Score should fall back to RRF score (a finite number)
    const score = results[0].recall_score
    expect(score).toBeDefined()
    expect(Number.isFinite(score)).toBe(true)
  })
})
