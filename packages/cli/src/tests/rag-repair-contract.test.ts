import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { _configureDb, closeDb, getDb, runMigrations, setDb } from 'fulcrum-agent-core'
import { executeRagHealthCommand, executeRagRepairPlanCommand } from '../commands/memory-rag-health.js'
import { executeRagRebuildCommand } from '../commands/memory-rag-lifecycle.js'

beforeEach(() => {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  db.prepare("INSERT INTO workspaces(workspace_id, name) VALUES ('ws_1', 'ws_1')").run()
  db.prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_1', 'ws_1', 'proj_1')").run()
})

afterEach(() => {
  closeDb()
})

describe('RAG repair CLI contract', () => {
  it('returns non-mutating repair plan JSON for memory doctor --repair-plan', () => {
    getDb().prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, vault_path, title, summary, entities, provenance
      ) VALUES (
        'mem_cli_repair', 'ws_1', 'proj_1', 'fact', 'project',
        'repair source', 'hash-cli-repair',
        3, 'curated/pages/mem_cli_repair.md', 'repair', 'repair', '[]', '{}'
      )
    `).run()

    const plan = executeRagRepairPlanCommand({ workspace_id: 'ws_1', project_id: 'proj_1' }, getDb())

    expect(plan.repair_plan_id).toMatch(/^ragrepairplan_/)
    expect(plan.health_status).not.toBe('healthy')
    expect(plan.required_actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ command: expect.stringContaining('fulcrum memory rebuild') }),
    ]))
    expect(plan.mutation_scope).toMatchObject({ derived_state_only: true, canonical_sources_mutated: false })
  })

  it('returns final health verification and retry action output after targeted execute', async () => {
    const result = await executeRagRebuildCommand({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      mode: 'execute',
      runtime_profile: 'dev',
      domains: ['fts'],
      allow_empty: true,
    }, getDb())

    expect(result.repair_plan_id).toMatch(/^ragrepairplan_/)
    expect(result.final_health_status).toBeDefined()
    expect(result.verification).toMatchObject({
      derived_state_only: true,
      canonical_sources_mutated: false,
    })
    expect(result.retryable_actions).toEqual(expect.any(Array))
  })

  it('allows extended health checks to explicitly exclude out-of-scope domains', () => {
    const report = executeRagHealthCommand({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      out_of_scope_domains: ['graph'],
    }, getDb())

    expect(report.domains['graph']).toMatchObject({ status: 'out_of_scope' })
  })
})
