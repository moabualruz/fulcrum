import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { _configureDb, closeDb, getDbAtPath, resolveRuntimeDataProfile, runMigrations, setDb } from 'fulcrum-agent-core'
import { runMigration101MemoryV3Lifecycle } from 'fulcrum-memory'
import { executeRagHealthCommand, formatRagHealthReport } from '../commands/memory-rag-health.js'
import { TOOL_REGISTRY } from '../tool-registry.js'
import { TOOL_SCHEMA_MAP } from '../mcp-tools.js'

let db: Database.Database
let tempDirs: string[] = []

beforeEach(() => {
  tempDirs = []
  db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  runMigration101MemoryV3Lifecycle(db)
  setDb(db)
  db.prepare("INSERT INTO workspaces(workspace_id, name) VALUES ('ws_1', 'ws_1')").run()
  db.prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_1', 'ws_1', 'proj_1')").run()
})

afterEach(() => {
  closeDb()
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

function mutationCounts(): Record<string, number> {
  const tables = ['rag_health_reports', 'events', 'rag_rebuild_reports', 'embedding_jobs', 'embedding_job_items']
  const counts = Object.fromEntries(tables.map((table) => {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }
    return [table, row.n]
  }))
  const total = db.prepare('SELECT total_changes() AS n').get() as { n: number }
  return { ...counts, total_changes: total.n }
}

describe('RAG health command and action read-only behavior', () => {
  it('returns health JSON without mutating operational tables', () => {
    const before = mutationCounts()

    const result = executeRagHealthCommand({ workspace_id: 'ws_1', project_id: 'proj_1' }, db)

    expect(result).toMatchObject({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      status: 'healthy',
    })
    expect(result.domains).toHaveProperty('vectors')
    expect(mutationCounts()).toEqual(before)
  })

  it('registers get_rag_health as a read-only MCP/action handler', async () => {
    const schema = TOOL_SCHEMA_MAP.get('get_rag_health')
    const entry = TOOL_REGISTRY.get('get_rag_health')

    expect(schema?.annotations?.readOnlyHint).toBe(true)
    expect(schema?.annotations?.idempotentHint).toBe(true)
    expect(entry?.capabilities).toMatchObject({ readOnly: true, destructive: false })
    expect(entry?.schema).toBe(schema)

    const before = mutationCounts()
    const result = await entry?.handler({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
    }, {
      db,
      workspace_id: 'ws_1',
      project_id: 'proj_1',
    })

    expect(result).toMatchObject({ workspace_id: 'ws_1', project_id: 'proj_1' })
    expect(mutationCounts()).toEqual(before)
  })

  it('opens the selected runtime profile database when no DB is injected', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'fulcrum-rag-health-profile-'))
    tempDirs.push(dataDir)
    const manifest = resolveRuntimeDataProfile({ profile: 'test', data_dir: dataDir })
    const profileDb = getDbAtPath(manifest.paths.db)
    runMigrations(profileDb)
    runMigration101MemoryV3Lifecycle(profileDb)
    profileDb.prepare("INSERT INTO workspaces(workspace_id, name) VALUES ('ws_profile', 'ws_profile')").run()
    profileDb.prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_profile', 'ws_profile', 'proj_profile')").run()
    profileDb.prepare(`
      INSERT INTO l0_sources (
        source_id, source_type, workspace_id, project_id, vault_path, content_hash, size_bytes
      ) VALUES ('src_profile', 'bash_trace', 'ws_profile', 'proj_profile', 'raw/missing.md', 'hash', 12)
    `).run()

    const result = executeRagHealthCommand({
      workspace_id: 'ws_profile',
      project_id: 'proj_profile',
      runtime_profile: 'test',
      data_dir: dataDir,
    })

    expect(result.runtime_profile).toBe('test')
    expect(result.profile_manifest.paths.db).toBe(manifest.paths.db)
    expect(result.domains['l0']).toMatchObject({ rows: 1, missing_files: 1 })
  })

  it('formats unhealthy domains with counts and recommended actions', () => {
    const output = formatRagHealthReport({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      status: 'degraded',
      generated_at: '2026-04-23T00:00:00.000Z',
      domains: {
        l0: { status: 'degraded', files: 1, rows: 2, missing_files: 1, orphan_files: 1 },
        fts: { status: 'failed', checked: 2, failed: 1, missing_index_rows: 2 },
        graph: { status: 'degraded', entities: 0, edges: 0, coverage_gaps: ['memories', 'code'] },
        vectors: {
          status: 'degraded',
          stale: 1,
          failed_job_items: 1,
          groups: [{
            source_domain: 'memory',
            provider: 'local',
            model: 'test-model',
            requested_device: 'cuda',
            actual_device: 'cpu',
            dimensions: 1024,
            status: 'stale',
            count: 1,
          }],
          failures_by_reason: [{
            error_type: 'TimeoutError',
            error_message: 'timed out',
            count: 1,
          }],
        },
      },
      recommended_actions: ['Run `fulcrum memory rebuild --domain fts --execute --profile dev --json`.'],
      warnings: [],
      errors: [],
    })

    expect(output).toContain('l0: degraded (files=1, rows=2, missing_files=1, orphan_files=1)')
    expect(output).toContain('fts: failed (checked=2, failed=1, missing_index_rows=2)')
    expect(output).toContain('coverage_gaps=memories,code')
    expect(output).toContain('groups=source_domain:memory/provider:local/model:test-model/requested_device:cuda/actual_device:cpu/dimensions:1024/status:stale/count:1')
    expect(output).toContain('failures_by_reason=error_type:TimeoutError/error_message:timed out/count:1')
    expect(output).toContain('Recommended actions:')
  })
})
