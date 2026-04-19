// packages/monitor/src/tests/memory-stats-endpoint.test.ts
//
// Memory v3 PR 8 unit 8.3 — GET /memory/stats route shape + workspace
// filtering. Computation is unit-tested against a seeded DB in the memory
// package; this file pins only the HTTP contract.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Database from 'better-sqlite3'
import { setDb, _configureDb, runMigrations } from 'fulcrum-agent-core'
import { runMigration101MemoryV3Lifecycle } from 'fulcrum-memory'
import { startMonitorServer } from '../server.js'

let db: Database.Database
let server: ReturnType<typeof startMonitorServer>
let tmpVault: string
let prevVaultEnv: string | undefined

beforeEach(() => {
  db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  runMigration101MemoryV3Lifecycle(db)

  db.prepare(`INSERT INTO workspaces (workspace_id, name, status) VALUES ('ws_1', 'Test', 'active')`).run()

  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-memstats-ep-'))
  mkdirSync(join(tmpVault, 'curated'), { recursive: true })
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault

  server = startMonitorServer({ workspace_id: 'ws_1' })
})

afterEach(async () => {
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
  rmSync(tmpVault, { recursive: true, force: true })
  await server.stop()
  db.close()
})

function get(path: string): Promise<Response> {
  return server.fetch(new Request(`http://localhost${path}`)) as Promise<Response>
}

describe('GET /memory/stats', () => {
  it('returns the v3 stats shape for the default workspace_id', async () => {
    const res = await get('/memory/stats')
    expect(res.status).toBe(200)
    const json = await res.json() as { data: Record<string, unknown> }
    expect(json.data).toHaveProperty('l0.total', 0)
    expect(json.data).toHaveProperty('l0.ingest_rate_per_hour', 0)
    expect(json.data).toHaveProperty('l1.total', 0)
    expect(json.data).toHaveProperty('l1.superseded', 0)
    expect(json.data).toHaveProperty('l1.by_tier.working', 0)
    expect(json.data).toHaveProperty('graph.nodes', 0)
    expect(json.data).toHaveProperty('graph.edges', 0)
    expect(json.data).toHaveProperty('curation.runs_last_24h', 0)
    expect(json.data).toHaveProperty('curation.p50_duration_ms', null)
    expect(json.data).toHaveProperty('curation.p95_duration_ms', null)
  })

  it('reflects seeded L0 + L1 counts', async () => {
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO l0_sources (source_id, source_type, session_id, workspace_id, project_id, cwd,
                               vault_path, content_hash, size_bytes, created_at)
       VALUES ('l0src_x', 'bash_trace', null, 'ws_1', null, null,
               'raw/bash_trace/2026/04/19/l0src_x.md', 'h', 4, ?)`,
    ).run(now)
    db.prepare(
      `INSERT INTO memories (
         memory_id, workspace_id, project_id, kind, scope, content, created_at, updated_at,
         access_count, confidence, retention_tier, schema_version, superseded_by,
         entities, title, summary, slug, vault_path, content_hash, provenance,
         supersedes, consolidated_from_ids, confidence_decay_at, embedded
       ) VALUES ('p1', 'ws_1', null, 'page', 'global', 'body', ?, ?, 0, 0.8,
                 'working', 3, null, '[]', 'p1', 'p1', 'p1', 'curated/pages/p1.md',
                 'h', '{}', null, null, ?, 0)`,
    ).run(now, now, now)

    const res = await get('/memory/stats')
    expect(res.status).toBe(200)
    const json = await res.json() as { data: { l0: { total: number }; l1: { total: number; by_tier: { working: number } } } }
    expect(json.data.l0.total).toBe(1)
    expect(json.data.l1.total).toBe(1)
    expect(json.data.l1.by_tier.working).toBe(1)
  })

  it('returns 400 when workspace_id is missing and server has no default', async () => {
    await server.stop()
    server = startMonitorServer({})
    const res = await server.fetch(new Request('http://localhost/memory/stats')) as Response
    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/workspace_id/)
  })

  it('honors an explicit workspace_id query param', async () => {
    db.prepare(`INSERT OR IGNORE INTO workspaces (workspace_id, name) VALUES ('ws_2', 'Other')`).run()
    const res = await get('/memory/stats?workspace_id=ws_2')
    expect(res.status).toBe(200)
    const json = await res.json() as { data: { l0: { total: number } } }
    expect(json.data.l0.total).toBe(0)
  })
})
