import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { searchCode } from '../retrieval/search-code.js'
import { searchContext } from '../retrieval/search-context.js'

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  resetTestDb()
})

function seedSharedCorpus(): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO memories (
      memory_id, workspace_id, project_id, kind, scope, content, content_hash,
      schema_version, title, summary, entities, provenance
    ) VALUES (
      'mem_plan_ro', 'ws_1', 'proj_1', 'fact', 'project',
      'Planner read only retrieval should not persist by default.',
      'hash-plan-ro', 3, 'Planner readonly memory', 'planner readonly', '[]', '{}'
    )
  `).run()
  db.prepare(`
    INSERT INTO code_chunks (
      chunk_id, workspace_id, project_id, file_path, language,
      chunk_strategy, source_type, content, content_hash, start_line, end_line, symbol_path, indexed_at
    ) VALUES (
      'chunk_plan_ro', 'ws_1', 'proj_1', 'src/planner.ts', 'typescript',
      'syntax', 'code', 'export function plannerReadonly() { return "planner read only token" }',
      'hash-chunk-plan-ro', 3, 5, 'plannerReadonly', '2026-04-23T00:00:00.000Z'
    )
  `).run()
}

describe('search planner readonly contract', () => {
  it('keeps search_context read-only by default', async () => {
    seedSharedCorpus()

    const response = await searchContext({
      query: 'planner read only',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      explain: true,
      context_budget_tokens: 32,
    })

    expect(response.results.length).toBeGreaterThan(0)
    expect((getDb().prepare('SELECT COUNT(*) AS n FROM rag_query_traces').get() as { n: number }).n).toBe(0)
    expect((getDb().prepare('SELECT COUNT(*) AS n FROM rag_context_results').get() as { n: number }).n).toBe(0)
    expect((getDb().prepare('SELECT COUNT(*) AS n FROM context_packs').get() as { n: number }).n).toBe(0)
  })

  it('keeps search_code read-only by default and persists telemetry only when requested', async () => {
    seedSharedCorpus()

    const readonly = await searchCode({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      text: 'planner read only token',
      explain: true,
    })
    expect(readonly.results.length).toBeGreaterThan(0)
    expect((getDb().prepare('SELECT COUNT(*) AS n FROM memory_recall_events WHERE source = ?').get('search_code') as { n: number }).n).toBe(0)
    expect((getDb().prepare('SELECT COUNT(*) AS n FROM rag_query_traces').get() as { n: number }).n).toBe(0)

    const persisted = await searchCode({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      text: 'planner read only token',
      explain: true,
      persist: true,
    })

    expect(persisted.query_trace_id).toMatch(/^ragtrace_/)
    expect((getDb().prepare('SELECT COUNT(*) AS n FROM memory_recall_events WHERE source = ?').get('search_code') as { n: number }).n).toBeGreaterThan(0)
    expect((getDb().prepare('SELECT COUNT(*) AS n FROM rag_query_traces').get() as { n: number }).n).toBe(1)
  })
})
