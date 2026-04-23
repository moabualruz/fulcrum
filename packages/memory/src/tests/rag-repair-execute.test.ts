import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { getDb, resolveRuntimeDataProfile } from 'fulcrum-agent-core'
import { contentHash } from '../dedup.js'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { runMigration101MemoryV3Lifecycle } from '../schema.js'
import { runRagRebuild } from '../setup/rag-lifecycle.js'

let tmpVault: string
let prevVaultPath: string | undefined
let runtimeDataDir: string

beforeEach(() => {
  const db = createTestDb()
  runMigration101MemoryV3Lifecycle(db)
  seedWorkspaceAndProject(db)
  tmpVault = join(tmpdir(), `fulcrum-rag-repair-execute-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  runtimeDataDir = join(tmpVault, 'profiles')
  mkdirSync(runtimeDataDir, { recursive: true })
  prevVaultPath = process.env['FULCRUM_VAULT_PATH']
  delete process.env['FULCRUM_VAULT_PATH']
})

afterEach(() => {
  if (prevVaultPath === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultPath
  rmSync(tmpVault, { recursive: true, force: true })
  resetTestDb()
})

function writeScopedPage(relPath: string, body: string): void {
  const fullPath = join(tmpVault, relPath)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, `---\nworkspace_id: ws_1\nproject_id: proj_1\n---\n${body}\n`, 'utf-8')
}

describe('targeted RAG repair execution', () => {
  it('does not wipe canonical DB sources during normal repair', async () => {
    const manifest = resolveRuntimeDataProfile({ profile: 'test', data_dir: runtimeDataDir })
    tmpVault = manifest.paths.vault
    mkdirSync(tmpVault, { recursive: true })
    writeScopedPage('curated/pages/mem_rebuild_source.md', 'canonical source')
    getDb().prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, vault_path, title, summary, entities, provenance
      ) VALUES (
        'mem_rebuild_source', 'ws_1', 'proj_1', 'fact', 'project',
        'canonical source', ?,
        3, 'curated/pages/mem_rebuild_source.md', 'source', 'source', '[]', '{}'
      )
    `).run(contentHash('canonical source'))

    const report = await runRagRebuild({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      mode: 'execute',
      runtime_profile: 'test',
      data_dir: runtimeDataDir,
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

  it('scopes repair planning to requested rebuild domains instead of unrelated degraded domains', async () => {
    const manifest = resolveRuntimeDataProfile({ profile: 'test', data_dir: runtimeDataDir })
    tmpVault = manifest.paths.vault
    mkdirSync(tmpVault, { recursive: true })
    writeScopedPage('curated/pages/mem_scope.md', 'scope source')
    getDb().prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, vault_path, title, summary, entities, provenance
      ) VALUES (
        'mem_scope', 'ws_1', 'proj_1', 'fact', 'project',
        'scope source', ?,
        3, 'curated/pages/mem_scope.md', 'scope', 'scope', '[]', '{}'
      )
    `).run(contentHash('scope source'))

    const report = await runRagRebuild({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      mode: 'plan',
      runtime_profile: 'test',
      data_dir: runtimeDataDir,
      domains: ['fts'],
      allow_empty: true,
    }, getDb())

    expect(report.status).toBe('completed')
    expect(report.verification).toMatchObject({
      repair_strategy: 'targeted_repair',
      domains: ['fts'],
      blocking_conditions: [],
    })
  })
})
