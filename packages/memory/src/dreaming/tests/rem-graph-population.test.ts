// v2b PR 11 Task 2.2 — REM → Kuzu graph population tests.
// Verifies entity-extracted events produce Entity nodes + MENTIONS/ABOUT rels.

import { describe, it, expect, vi } from 'vitest'
import { wireRemToGraph, type GraphWriteSink } from '../rem-graph.js'
import type { RemEntity } from '../rem-extract.js'

// Build a test sink that captures upserts
function makeCapturingSink(): { sink: GraphWriteSink; nodes: unknown[]; edges: unknown[] } {
  const nodes: unknown[] = []
  const edges: unknown[] = []
  const sink: GraphWriteSink = {
    upsertNode: vi.fn().mockImplementation(node => { nodes.push(node); return Promise.resolve() }),
    upsertEdge: vi.fn().mockImplementation(edge => { edges.push(edge); return Promise.resolve() }),
  }
  return { sink, nodes, edges }
}

describe('REM graph population — v2b PR 11 Task 2.2', () => {
  it('upserts an Entity node for each extracted entity', async () => {
    const entities: RemEntity[] = [
      { type: 'file', name: 'src/write.ts', sourceIds: ['m1'] },
      { type: 'library', name: 'kuzu', sourceIds: ['m2'] },
    ]
    const { sink, nodes } = makeCapturingSink()
    await wireRemToGraph(entities, sink)
    expect(nodes.length).toBe(2)
  })

  it('upserts MENTIONS edges from source memories to entity nodes', async () => {
    const entities: RemEntity[] = [
      { type: 'file', name: 'src/index.ts', sourceIds: ['m1', 'm2'] },
    ]
    const { sink, edges } = makeCapturingSink()
    await wireRemToGraph(entities, sink)
    // One MENTIONS edge per source memory
    expect(edges.length).toBe(2)
  })

  it('produces no duplicate entity nodes for the same name+type', async () => {
    const entities: RemEntity[] = [
      { type: 'library', name: 'vitest', sourceIds: ['m1'] },
      { type: 'library', name: 'vitest', sourceIds: ['m2'] },  // duplicate
    ]
    const { sink, nodes } = makeCapturingSink()
    await wireRemToGraph(entities, sink)
    // Should upsert only once (second call for same name+type is idempotent)
    const entityNodes = nodes as Array<{ id: string }>
    const ids = new Set(entityNodes.map(n => n.id))
    expect(ids.size).toBe(1)
  })

  it('does NOT write Memory↔code edges (those belong to v2a reducer)', async () => {
    // v2b's REM wirer only handles Entity-side upserts
    // Memory↔code edges (MENTIONS_SYMBOL, ABOUT_FILE, ABOUT_SYMBOL) go through
    // the v2a PR 7 memory.ts reducer — not duplicated here
    const entities: RemEntity[] = [
      { type: 'symbol', name: 'writeMemory', sourceIds: ['m1'] },
    ]
    const { sink, edges } = makeCapturingSink()
    await wireRemToGraph(entities, sink)
    const edgeArr = edges as Array<{ table: string }>
    // Only MENTIONS edges, no ABOUT_SYMBOL / MENTIONS_SYMBOL
    for (const e of edgeArr) {
      expect(e.table).not.toBe('MENTIONS_SYMBOL')
      expect(e.table).not.toBe('ABOUT_SYMBOL')
      expect(e.table).not.toBe('ABOUT_FILE')
    }
  })
})
