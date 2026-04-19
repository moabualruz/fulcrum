// packages/cli/src/tests/memory-recall-delegation.test.ts
//
// Memory v3 PR 5 unit 5.5 — `recall_memory` delegates to `recall_knowledge`
// after the FULCRUM_MEMORY_V3 flag retirement in PR 9.5.
//
// Behaviour pin: recall_memory always delegates to recall_knowledge — the
// result envelope has `results` with each hit carrying `sources` + `stage_ranks`.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  _configureDb,
  setDb,
  closeDb,
  runMigrations,
  getDb,
  registerEmbeddingProvider,
  initEmbedding,
  resetProviders,
} from 'fulcrum-agent-core'
import {
  runMigration101MemoryV3Lifecycle,
  createCuratedPage,
  recordL1Embedding,
  flushPendingMemoryWrites,
  type CuratedPage,
} from 'fulcrum-memory'
import { TOOL_REGISTRY, buildDeps } from '../tool-registry.js'

const STUB_DIM = 1024
class Stub {
  dimensions = STUB_DIM
  async warmUp(): Promise<void> {}
  async embed(t: string): Promise<Float32Array> { return this.embedDocument(t) }
  async embedBatch(ts: string[]): Promise<Float32Array[]> { return Promise.all(ts.map((t) => this.embedDocument(t))) }
  async embedDocument(t: string): Promise<Float32Array> {
    const v = new Float32Array(STUB_DIM)
    for (let i = 0; i < t.length; i++) v[i % STUB_DIM] = (v[i % STUB_DIM] ?? 0) + t.charCodeAt(i) / 1024
    return v
  }
}

async function installStub(): Promise<void> {
  registerEmbeddingProvider('fulcrum-test-stub', () => new Stub())
  await initEmbedding({
    workspace_id: 'test', project_id: 'test', port: 0,
    embedding: { text: { provider: 'fulcrum-test-stub' as 'custom', model: 'stub' }, code: null },
    reranker: { provider: 'custom', model: 'stub' },
    policy: { wip_limit: 0, wip_limit_per_role: {}, heartbeat_timeout_minutes: 0, escalation_timeout_minutes: 0 },
  })
}

let tmpVault: string
let prevVaultEnv: string | undefined

beforeEach(async () => {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  runMigration101MemoryV3Lifecycle(db)
  db.prepare("INSERT OR IGNORE INTO workspaces(workspace_id, name) VALUES ('ws_d', 'ws_d')").run()
  db.prepare("INSERT OR IGNORE INTO projects(project_id, workspace_id, name) VALUES ('proj_d', 'ws_d', 'proj_d')").run()
  setDb(db)
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-delegate-'))
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
  await installStub()
})

afterEach(() => {
  resetProviders()
  closeDb()
  rmSync(tmpVault, { recursive: true, force: true })
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
})

function seedPage(id: string, body: string): CuratedPage {
  const now = '2026-04-18T10:00:00Z'
  const page: CuratedPage = {
    id, schema: 'fulcrum.memory/v3', type: 'page',
    title: `Page ${id}`, confidence: 0.7,
    first_seen: now, last_confirmed: now, retention_tier: 'working', access_count: 0,
    sources: ['01SRC'], sources_via: [], supersedes: [], superseded_by: null, entities: [],
    workspace_id: 'ws_d', project_id: 'proj_d',
    body,
  }
  return createCuratedPage(page)
}

describe('recall_memory delegation (PR 9.5 — unconditional v3 alias)', () => {
  it('routes through recall_knowledge — hits carry sources[] + stage_ranks', async () => {
    seedPage('01DEL_A', '# Auth\n\nAuth middleware. [[raw/bash_trace/2026/04/18/01SRC]]\n')
    recordL1Embedding(getDb(), '01DEL_A')
    await flushPendingMemoryWrites(5_000)

    const entry = TOOL_REGISTRY.get('recall_memory')!
    const deps = buildDeps('ws_d', 'proj_d')
    const result = await entry.handler({ query: 'auth middleware' }, deps) as { results: Array<{ sources?: string[]; stage_ranks?: unknown }> }
    expect(result.results.length).toBeGreaterThan(0)
    expect(result.results[0]?.sources).toBeDefined()
    expect(result.results[0]?.stage_ranks).toBeDefined()
  })
})
