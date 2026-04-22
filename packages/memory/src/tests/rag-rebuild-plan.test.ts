import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { runRagRebuild } from '../setup/rag-lifecycle.js'

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  resetTestDb()
})

function tableCount(table: string): number {
  return (getDb().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
}

describe('RAG rebuild plan and dry-run', () => {
  it('plan returns counts without persisting reports or candidates', async () => {
    const beforeReports = tableCount('rag_rebuild_reports')
    const beforeCandidates = tableCount('rag_rebuild_candidates')

    const result = await runRagRebuild({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      mode: 'plan',
      domains: ['code'],
      allow_empty: true,
    })

    expect(result.status).toBe('completed')
    expect(result.candidate).toBeNull()
    expect(tableCount('rag_rebuild_reports')).toBe(beforeReports)
    expect(tableCount('rag_rebuild_candidates')).toBe(beforeCandidates)
  })

  it('dry-run is non-mutating and reports empty scope unless allow_empty is set', async () => {
    const result = await runRagRebuild({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      mode: 'dry_run',
      domains: ['code'],
    })

    expect(result.status).toBe('failed')
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'empty_scope' }))
    expect(tableCount('rag_rebuild_reports')).toBe(0)
    expect(tableCount('rag_rebuild_candidates')).toBe(0)
  })
})

