import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { _configureDb, closeDb, getDb, runMigrations, setDb } from 'fulcrum-agent-core'
import { contentHash, runMigration101MemoryV3Lifecycle } from 'fulcrum-memory'
import { executeRagHealthCommand, executeRagRepairPlanCommand } from '../commands/memory-rag-health.js'
import { executeRagRebuildCommand } from '../commands/memory-rag-lifecycle.js'

let tempDirs: string[] = []
let prevVaultPath: string | undefined

beforeEach(() => {
  tempDirs = []
  prevVaultPath = process.env['FULCRUM_VAULT_PATH']
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  runMigration101MemoryV3Lifecycle(db)
  setDb(db)
  db.prepare("INSERT INTO workspaces(workspace_id, name) VALUES ('ws_1', 'ws_1')").run()
  db.prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_1', 'ws_1', 'proj_1')").run()
})

afterEach(() => {
  closeDb()
  if (prevVaultPath === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultPath
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

describe('RAG repair CLI contract', () => {
  it('uses the same vault path for health and repair plan when profile is implicit', () => {
    const vaultDir = mkdtempSync(join(tmpdir(), 'fulcrum-rag-repair-vault-'))
    tempDirs.push(vaultDir)
    const relPath = 'raw/tool_trace/2026/04/24/01RAW.md'
    const fullPath = join(vaultDir, relPath)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, `---\nworkspace_id: ws_1\nproject_id: proj_1\n---\nraw source\n`, 'utf-8')
    process.env['FULCRUM_VAULT_PATH'] = vaultDir
    getDb().prepare(`
      INSERT INTO l0_sources (
        source_id, source_type, workspace_id, project_id, cwd, vault_path, content_hash, size_bytes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('01RAW', 'tool_trace', 'ws_1', 'proj_1', '/repo', relPath, contentHash('raw source'), 10)

    const health = executeRagHealthCommand({ workspace_id: 'ws_1', project_id: 'proj_1' }, getDb())
    const plan = executeRagRepairPlanCommand({ workspace_id: 'ws_1', project_id: 'proj_1' }, getDb())

    expect(health.domains['l0']).toMatchObject({ status: 'healthy', missing_files: 0 })
    expect(plan.domains).not.toContain('l0')
    expect(plan.blocking_conditions.map(condition => condition.domain)).not.toContain('l0')
  })

  it('returns non-mutating repair plan JSON for memory doctor --repair-plan', () => {
    const vaultDir = mkdtempSync(join(tmpdir(), 'fulcrum-rag-repair-cli-'))
    tempDirs.push(vaultDir)
    const fullPath = join(vaultDir, 'curated/pages/mem_cli_repair.md')
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, `---\nworkspace_id: ws_1\nproject_id: proj_1\n---\nrepair source\n`, 'utf-8')
    process.env['FULCRUM_VAULT_PATH'] = vaultDir
    getDb().prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, vault_path, title, summary, entities, provenance
      ) VALUES (
        'mem_cli_repair', 'ws_1', 'proj_1', 'fact', 'project',
        'repair source', ?,
        3, 'curated/pages/mem_cli_repair.md', 'repair', 'repair', '[]', '{}'
      )
    `).run(contentHash('repair source'))

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
