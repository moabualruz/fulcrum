import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { _configureDb, closeDb, getDb, runMigrations, setDb } from 'fulcrum-agent-core'
import { TOOL_SCHEMA_MAP } from '../mcp-tools.js'
import { TOOL_REGISTRY } from '../tool-registry.js'

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

describe('RAG repair MCP/action contract', () => {
  it('executes get_rag_repair_plan and extended get_rag_health handlers', async () => {
    const deps = { workspace_id: 'ws_1', project_id: 'proj_1' } as never

    const plan = await TOOL_REGISTRY.get('get_rag_repair_plan')!.handler({ workspace_id: 'ws_1', project_id: 'proj_1' }, deps)
    expect(plan).toMatchObject({
      repair_plan_id: expect.stringMatching(/^ragrepairplan_/),
      mutation_scope: { derived_state_only: true, canonical_sources_mutated: false },
    })

    const health = await TOOL_REGISTRY.get('get_rag_health')!.handler({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      out_of_scope_domains: ['graph'],
    }, deps)
    expect(health).toMatchObject({
      domains: { graph: { status: 'out_of_scope' } },
    })
  })

  it('documents out_of_scope and next-action contract fields in schemas', () => {
    const healthSchema = JSON.stringify(TOOL_SCHEMA_MAP.get('get_rag_health'))
    const repairSchema = JSON.stringify(TOOL_SCHEMA_MAP.get('get_rag_repair_plan'))
    const evalSchema = JSON.stringify(TOOL_SCHEMA_MAP.get('run_rag_eval'))

    expect(healthSchema).toContain('out_of_scope')
    expect(repairSchema).toContain('required_actions')
    expect(evalSchema).toContain('next_action')
  })

  it('opens the requested runtime profile for repair-plan actions instead of using deps db', async () => {
    const command = await import('../commands/memory-rag-health.js')
    const spy = vi.spyOn(command, 'executeRagRepairPlanCommand').mockImplementation((input, db) => ({
      repair_plan_id: 'ragrepairplan_profile_test',
      workspace_id: input.workspace_id ?? 'ws_1',
      project_id: input.project_id ?? 'proj_1',
      runtime_profile: input.runtime_profile,
      used_deps_db: Boolean(db),
    }) as never)

    const deps = {
      db: getDb(),
      workspace_id: 'ws_1',
      project_id: 'proj_1',
    } as never
    const plan = await TOOL_REGISTRY.get('get_rag_repair_plan')!.handler({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      runtime_profile: 'test',
    }, deps) as { runtime_profile: string; used_deps_db: boolean }

    expect(plan).toMatchObject({ runtime_profile: 'test', used_deps_db: false })
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ runtime_profile: 'test' }), undefined)
  })
})
