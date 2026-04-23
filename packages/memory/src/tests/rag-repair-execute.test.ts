import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { runRagRebuild } from '../setup/rag-lifecycle.js'

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  resetTestDb()
})

describe('targeted RAG repair execution', () => {
  it('does not wipe canonical DB sources during normal repair', async () => {
    getDb().prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, vault_path, title, summary, entities, provenance
      ) VALUES (
        'mem_rebuild_source', 'ws_1', 'proj_1', 'fact', 'project',
        'canonical source', 'hash-rebuild',
        3, 'curated/pages/mem_rebuild_source.md', 'source', 'source', '[]', '{}'
      )
    `).run()

    const report = await runRagRebuild({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      mode: 'execute',
      runtime_profile: 'dev',
      domains: ['fts'],
      allow_empty: true,
    }, getDb())

    expect(report.status).toBe('completed')
    expect(report.repair_plan_id).toMatch(/^ragrepairplan_/)
    expect(report.final_health_status).toBeDefined()
    expect(report.verification).toMatchObject({
      canonical_sources_mutated: false,
      derived_state_only: true,
    })
    expect(report.retryable_actions).toEqual(expect.any(Array))
    expect((getDb().prepare("SELECT COUNT(*) AS n FROM memories WHERE memory_id = 'mem_rebuild_source'").get() as { n: number }).n).toBe(1)
  })
})
