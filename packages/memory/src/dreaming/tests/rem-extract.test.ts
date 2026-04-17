// v2b PR 11 Task 2.1 — REM entity extraction tests.

import { describe, it, expect } from 'vitest'
import { extractEntitiesFromMemories, type RemEntity, type MemoryRow } from '../rem-extract.js'

function makeMemory(id: string, content: string): MemoryRow {
  return { memory_id: id, slug: id, content, scope: 'short', recall_count: 0, unique_query_count: 0, max_recall_score: 0 }
}

describe('REM entity extraction — v2b PR 11 Task 2.1', () => {
  it('extracts file path mentions from memory content', () => {
    const memories = [
      makeMemory('m1', 'edited packages/memory/src/write.ts to add kind validation'),
    ]
    const { entities } = extractEntitiesFromMemories(memories)
    const fileEntities = entities.filter(e => e.type === 'file')
    expect(fileEntities.some(e => e.name.includes('write.ts'))).toBe(true)
  })

  it('extracts library mentions', () => {
    const memories = [
      makeMemory('m2', 'installed better-sqlite3 and kuzu packages'),
    ]
    const { entities } = extractEntitiesFromMemories(memories)
    const libEntities = entities.filter(e => e.type === 'library')
    expect(libEntities.some(e => e.name === 'better-sqlite3' || e.name === 'kuzu')).toBe(true)
  })

  it('extracts decision mentions', () => {
    const memories = [
      makeMemory('m3', 'Decision: use RRF fusion with k=60 for hybrid recall'),
    ]
    const { entities } = extractEntitiesFromMemories(memories)
    const decisionEntities = entities.filter(e => e.type === 'decision')
    expect(decisionEntities.length).toBeGreaterThan(0)
  })

  it('returns entity list with non-zero size for 50 diverse short-term entries', () => {
    // Diverse content: 10 different files + 5 libraries + 10 decisions = 25+ unique entities
    const files = Array.from({ length: 10 }, (_, i) => `src/module${i}/index.ts`)
    const libs = ['better-sqlite3', 'kuzu', 'vitest', 'chokidar', 'ulidx']
    const memories = [
      ...files.map((f, i) => makeMemory(`mf${i}`, `modified ${f} to fix bug`)),
      ...libs.map((l, i) => makeMemory(`ml${i}`, `installed ${l} and updated config`)),
      ...Array.from({ length: 10 }, (_, i) =>
        makeMemory(`md${i}`, `Decision: adopt pattern ${i} for the pipeline`)
      ),
    ]
    const { entities } = extractEntitiesFromMemories(memories)
    expect(entities.length).toBeGreaterThanOrEqual(10)
  })

  it('deduplicates repeated entity names', () => {
    const memories = [
      makeMemory('ma', 'modified packages/memory/src/write.ts'),
      makeMemory('mb', 'also touched packages/memory/src/write.ts'),
    ]
    const { entities } = extractEntitiesFromMemories(memories)
    const writeTs = entities.filter(e => e.name.includes('write.ts'))
    // Should appear once after dedup
    expect(writeTs.length).toBe(1)
  })
})
