// packages/memory/src/tests/integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { writeMemory } from '../write.js'
import { recallMemory } from '../recall.js'
import type { CompactMemory, FullMemory } from '../types.js'
import { linkMemoryToEntity, getMemoryEntities } from '../entities.js'
import { ingestFile } from '../ingest.js'
import { contentHash } from '../dedup.js'
import { computeImportance, computeFreshness } from '../scoring.js'

beforeEach(() => { createTestDb() })
afterEach(() => resetTestDb())

describe('integration: write → dedup → recall → link', () => {
  it('full happy path', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)

    // 1. Write a memory
    const m = await writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      scope: 'project', kind: 'decision',
      title: 'Use SQLite',
      summary: 'We chose SQLite for local-first storage reasons',
      content: 'SQLite was chosen because it requires zero infrastructure and supports WAL mode.',
      tags: ['architecture', 'database'],
      confidence: 0.95,
    })
    expect(m.memory_id).toBeTruthy()
    expect(m.content_hash).toBe(contentHash('SQLite was chosen because it requires zero infrastructure and supports WAL mode.'))

    // 2. Write duplicate — should hit dedup, not insert new row
    const dup = await writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      scope: 'project', kind: 'decision',
      title: 'DIFFERENT TITLE', summary: 'different', // ignored
      content: 'SQLite was chosen because it requires zero infrastructure and supports WAL mode.',
    })
    expect(dup.memory_id).toBe(m.memory_id)
    expect(dup.title).toBe('Use SQLite')  // original preserved
    expect(dup.access_count).toBe(1)

    // 3. Recall — compact mode
    const compact = await recallMemory({ workspace_id: 'ws_1', query: 'SQLite', mode: 'compact' }) as unknown as CompactMemory[]
    expect(compact.length).toBeGreaterThan(0)
    expect((compact[0] as unknown as Record<string, unknown>).memory_id).toBe(m.memory_id)
    expect((compact[0] as unknown as Record<string, unknown>)).not.toHaveProperty('canonical_text')

    // 4. Recall — total_ranked with full fields
    const ranked = await recallMemory({ workspace_id: 'ws_1', query: 'SQLite', mode: 'total_ranked' }) as unknown as FullMemory[]
    expect(ranked.length).toBeGreaterThan(0)
    expect((ranked[0] as unknown as Record<string, unknown>)).toHaveProperty('canonical_text')

    // 5. Link memory to entities
    await linkMemoryToEntity({ memory_id: m.memory_id, entity_type: 'project', entity_id: 'proj_1' })
    await linkMemoryToEntity({ memory_id: m.memory_id, entity_type: 'task', entity_id: 'task_xyz', relation_type: 'derived_from' })
    const entities = await getMemoryEntities(m.memory_id)
    expect(entities).toHaveLength(2)
    expect(entities.find(e => e.entity_type === 'task')?.relation_type).toBe('derived_from')

    // 6. Dynamic scoring (no DB call — pure math)
    const importance = computeImportance({ access_count: dup.access_count, confidence: m.confidence, entity_link_count: entities.length })
    expect(importance).toBeGreaterThan(0)
    const freshness = computeFreshness(m.updated_at)
    expect(freshness).toBeGreaterThan(0.9)  // just created
  })
})

describe('integration: ingest → recall', () => {
  it('ingested file content is recalled via FTS5', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)

    const code = `
export function computeTotal(items: number[]): number {
  return items.reduce((acc, n) => acc + n, 0)
}

export class Calculator {
  add(a: number, b: number): number { return a + b }
  subtract(a: number, b: number): number { return a - b }
}
`.trim()

    const result = await ingestFile({
      workspace_id: 'ws_1', project_id: 'proj_1',
      file_path: 'src/calculator.ts', content: code, language: 'typescript',
    })
    expect(result.chunks_created).toBeGreaterThan(0)
    expect(result.memories_created).toBeGreaterThan(0)

    const recalled = await recallMemory({ workspace_id: 'ws_1', query: 'Calculator', mode: 'total_ranked' }) as unknown as FullMemory[]
    expect(recalled.length).toBeGreaterThan(0)

    // sourcemap mode: results scoped to file
    const sourcemap = await recallMemory({ workspace_id: 'ws_1', query: 'Calculator', mode: 'total_ranked', file_path: 'src/calculator.ts' }) as unknown as FullMemory[]
    expect(sourcemap.length).toBeGreaterThan(0)
  })
})

describe('integration: cross-workspace isolation', () => {
  it('memories written in ws_1 are not visible in ws_2', async () => {
    const db = getDb()
    db.prepare("INSERT OR IGNORE INTO workspaces(workspace_id,name) VALUES ('ws_1','ws1')").run()
    db.prepare("INSERT OR IGNORE INTO workspaces(workspace_id,name) VALUES ('ws_2','ws2')").run()
    db.prepare("INSERT OR IGNORE INTO projects(project_id,workspace_id,name) VALUES ('proj_1','ws_1','p1')").run()

    await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', scope: 'project', kind: 'fact', title: 'secret', summary: 's', content: 'top secret data for ws_1 only' })

    const results = await recallMemory({ workspace_id: 'ws_2', query: 'secret' }) as unknown as CompactMemory[]
    expect(results).toHaveLength(0)
  })
})
