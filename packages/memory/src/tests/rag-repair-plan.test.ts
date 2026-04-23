import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { buildRagRepairPlan } from '../setup/rag-repair.js'

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  resetTestDb()
})

describe('RAG repair plan', () => {
  it('builds a non-mutating derived-state repair plan from health findings', () => {
    getDb().prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, vault_path, title, summary, entities, provenance
      ) VALUES (
        'mem_repair', 'ws_1', 'proj_1', 'fact', 'project',
        'repair source', 'hash-repair',
        3, 'curated/pages/mem_repair.md', 'repair', 'repair', '[]', '{}'
      )
    `).run()
    const beforeMemories = (getDb().prepare('SELECT COUNT(*) AS n FROM memories').get() as { n: number }).n
    const beforeReports = (getDb().prepare('SELECT COUNT(*) AS n FROM rag_repair_plans').get() as { n: number }).n

    const plan = buildRagRepairPlan({ workspace_id: 'ws_1', project_id: 'proj_1' })

    expect(plan.repair_plan_id).toMatch(/^ragrepairplan_/)
    expect(plan.health_status).not.toBe('healthy')
    expect(plan.clean_slate_required).toBe(false)
    expect(plan.mutation_scope).toMatchObject({
      derived_state_only: true,
      canonical_sources_mutated: false,
    })
    expect(plan.domains).toEqual(expect.arrayContaining(['graph', 'vectors']))
    expect(plan.required_actions.map(action => action.command)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('fulcrum memory rebuild --domain graph --workspace-id ws_1 --project-id proj_1 --execute --profile dev --json'),
        expect.stringContaining('fulcrum memory embed --scope memories --workspace-id ws_1 --project-id proj_1 --json'),
        expect.stringContaining('fulcrum memory embed --scope code --workspace-id ws_1 --project-id proj_1 --json'),
      ]),
    )
    expect(plan.required_actions.every(action => action.estimated_items > 0)).toBe(true)
    expect((getDb().prepare('SELECT COUNT(*) AS n FROM memories').get() as { n: number }).n).toBe(beforeMemories)
    expect((getDb().prepare('SELECT COUNT(*) AS n FROM rag_repair_plans').get() as { n: number }).n).toBe(beforeReports)
  })

  it('includes install profile confirmation in mutating rebuild commands', () => {
    getDb().prepare(`
      INSERT INTO tasks(task_id, workspace_id, project_id, display_id, title, status)
      VALUES ('task_repair_install', 'ws_1', 'proj_1', 'T-INSTALL', 'Install repair task', 'queued')
    `).run()
    getDb().prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, vault_path, title, summary, entities, provenance
      ) VALUES (
        'mem_repair_install', 'ws_1', 'proj_1', 'fact', 'project',
        'install vector repair source', 'hash-install-repair',
        3, 'curated/pages/mem_repair_install.md', 'install repair', 'install repair', '[]', '{}'
      )
    `).run()

    const plan = buildRagRepairPlan({ workspace_id: 'ws_1', project_id: 'proj_1', runtime_profile: 'install' })

    expect(plan.required_actions.map(action => action.command)).toEqual(expect.arrayContaining([
      expect.stringContaining('fulcrum memory rebuild --domain graph --workspace-id ws_1 --project-id proj_1 --execute --profile install --confirm-profile install --json'),
    ]))
    expect(plan.required_actions.every(action => action.estimated_items > 0)).toBe(true)
    expect(plan.required_actions.map(action => action.command).join('\n')).not.toContain('memory embed')
    expect(plan.blocking_errors).toEqual(expect.arrayContaining([
      expect.stringContaining('runtime_profile=install'),
    ]))
  })
})
