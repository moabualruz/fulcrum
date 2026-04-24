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
    const startRepairSchema = JSON.stringify(TOOL_SCHEMA_MAP.get('start_rag_repair'))
    const evalSchema = JSON.stringify(TOOL_SCHEMA_MAP.get('run_rag_eval'))

    expect(healthSchema).toContain('out_of_scope')
    expect(repairSchema).toContain('required_actions')
    expect(startRepairSchema).toContain('repair_plan_id')
    expect(evalSchema).toContain('next_action')
  })

  it('executes start_rag_repair through rebuild reporting and persists a repair run', async () => {
    const deps = {
      db: getDb(),
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      trusted_caller_role: 'chief_of_staff',
      trusted_caller_run_id: 'run_repair_tool',
    } as never

    const result = await TOOL_REGISTRY.get('start_rag_repair')!.handler({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      runtime_profile: 'dev',
      domains: ['fts'],
      allow_empty: true,
    }, deps) as {
      repair_run_id: string
      repair_plan_id: string
      report_id: string
      rebuild_report: { report_id: string; repair_plan_id: string }
    }

    expect(result.repair_run_id).toMatch(/^ragrepairrun_/)
    expect(result.repair_plan_id).toMatch(/^ragrepairplan_/)
    expect(result.report_id).toBe(result.rebuild_report.report_id)
    expect(result.rebuild_report.repair_plan_id).toBe(result.repair_plan_id)

    const row = getDb().prepare(`
      SELECT repair_plan_id, status, report_id, domains, finished_at
        FROM rag_repair_runs
       WHERE repair_run_id = ?
    `).get(result.repair_run_id) as {
      repair_plan_id: string
      status: string
      report_id: string
      domains: string
      finished_at: string
    }
    expect(row.repair_plan_id).toBe(result.repair_plan_id)
    expect(['completed', 'degraded', 'failed']).toContain(row.status)
    expect(row.report_id).toBe(result.report_id)
    expect(JSON.parse(row.domains)).toEqual(['fts'])
    expect(row.finished_at).toBeTruthy()

    const retry = await TOOL_REGISTRY.get('start_rag_repair')!.handler({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      runtime_profile: 'dev',
      repair_plan_id: result.repair_plan_id,
      domains: ['fts'],
      allow_empty: true,
    }, deps) as { repair_plan_id: string }
    expect(retry.repair_plan_id).toBe(result.repair_plan_id)
    const originalRun = getDb().prepare('SELECT repair_plan_id FROM rag_repair_runs WHERE repair_run_id = ?')
      .get(result.repair_run_id) as { repair_plan_id: string }
    expect(originalRun.repair_plan_id).toBe(result.repair_plan_id)
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
