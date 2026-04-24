// packages/cli/src/tests/memory-recall.test.ts
//
// Memory v3 PR 5 unit 5.3 — `fulcrum memory recall` + `recall_knowledge` MCP.
//
// Exercises the command-level wrapper that routes queries through
// runV3Search. The MCP tool entry is pinned in a separate assertion so
// we catch schema drift (names + required fields) before ship.

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
import { recallKnowledge } from '../commands/memory-recall.js'
import { TOOL_SCHEMAS } from '../mcp-tools.js'

const STUB_DIM = 1024

class StubEmbeddingProvider {
  dimensions = STUB_DIM
  async warmUp(): Promise<void> {}
  async embed(text: string): Promise<Float32Array> { return this.embedDocument(text) }
  async embedBatch(texts: string[]): Promise<Float32Array[]> { return Promise.all(texts.map((t) => this.embedDocument(t))) }
  async embedDocument(text: string): Promise<Float32Array> {
    const vec = new Float32Array(STUB_DIM)
    for (let i = 0; i < text.length; i++) vec[i % STUB_DIM] = (vec[i % STUB_DIM] ?? 0) + text.charCodeAt(i) / 1024
    return vec
  }
}

async function installStub(): Promise<void> {
  registerEmbeddingProvider('fulcrum-test-stub', () => new StubEmbeddingProvider())
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
  db.prepare("INSERT OR IGNORE INTO workspaces(workspace_id, name) VALUES ('ws_rc', 'ws_rc')").run()
  db.prepare("INSERT OR IGNORE INTO projects(project_id, workspace_id, name) VALUES ('proj_rc', 'ws_rc', 'proj_rc')").run()
  setDb(db)
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-recall-'))
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

function seedPage(id: string, body: string, sources: string[], confidence = 0.7): CuratedPage {
  const now = '2026-04-18T10:00:00Z'
  const page: CuratedPage = {
    id, schema: 'fulcrum.memory/v3', type: 'page',
    title: `Page ${id}`,
    confidence, first_seen: now, last_confirmed: now,
    retention_tier: 'working', access_count: 0,
    sources, sources_via: [], supersedes: [], superseded_by: null, entities: [],
    workspace_id: 'ws_rc', project_id: 'proj_rc',
    body,
  }
  return createCuratedPage(page)
}

describe('recallKnowledge (PR 5.3)', () => {
  it('returns hits with sources[] + stage ranks + truncated content', async () => {
    seedPage('01REC_A', '# Auth\n\nAuth middleware lives here. [[raw/bash_trace/2026/04/18/01SRC_A]]\n', ['01SRC_A'])
    recordL1Embedding(getDb(), '01REC_A')
    await flushPendingMemoryWrites(5_000)

    const out = await recallKnowledge({
      workspace_id: 'ws_rc', project_id: 'proj_rc',
      query: 'auth middleware', max_chars: 80,
    })
    expect(out.results.length).toBeGreaterThan(0)
    const hit = out.results.find((r) => r.memory_id === '01REC_A')!
    expect(hit).toBeDefined()
    expect(hit.sources).toContain('01SRC_A')
    expect(hit.content.length).toBeLessThanOrEqual(80)
    expect(hit.score).toBeGreaterThan(0)
    expect(Object.keys(hit.stage_ranks).length).toBeGreaterThan(0)
  })

  it('honours limit + offset', async () => {
    for (let i = 0; i < 5; i++) {
      seedPage(`01REC_${i}`, `# Auth ${i}\n\nAuth token flow details. [[raw/bash_trace/2026/04/18/01SRC_${i}]]\n`, [`01SRC_${i}`])
      recordL1Embedding(getDb(), `01REC_${i}`)
    }
    await flushPendingMemoryWrites(5_000)

    const first = await recallKnowledge({ workspace_id: 'ws_rc', project_id: 'proj_rc', query: 'Auth token', limit: 2 })
    const second = await recallKnowledge({ workspace_id: 'ws_rc', project_id: 'proj_rc', query: 'Auth token', limit: 2, offset: 2 })
    expect(first.results).toHaveLength(2)
    expect(second.results).toHaveLength(2)
    const firstIds = new Set(first.results.map((r) => r.memory_id))
    const secondIds = new Set(second.results.map((r) => r.memory_id))
    for (const id of secondIds) expect(firstIds.has(id)).toBe(false)
  })

  it('reports not_seeded before recall when no searchable L1 pages exist', async () => {
    const out = await recallKnowledge({ workspace_id: 'ws_rc', project_id: 'proj_rc', query: 'auth middleware' })
    expect(out.results).toEqual([])
    expect(out.reason).toBe('not_seeded')
    expect(out.readiness).toMatchObject({
      status: 'not_seeded',
      seeded: false,
      searchable_rows: 0,
    })
  })

  it('returns no_match when the seeded corpus has no matching page', async () => {
    seedPage(
      '01REC_UNRELATED',
      '# Billing\n\nBilling invoice details live here. [[raw/tool_trace/2026/04/18/01SRC_UNRELATED]]\n',
      ['01SRC_UNRELATED'],
    )
    await flushPendingMemoryWrites(5_000)

    const out = await recallKnowledge({ workspace_id: 'ws_rc', project_id: 'proj_rc', query: 'nonexistent-foo-bar' })
    expect(out.results).toEqual([])
    expect(out.reason).toBe('no_match')
    expect(out.readiness?.seeded).toBe(true)
  })
})

describe('MCP schema (PR 5.3)', () => {
  it('exposes recall_knowledge with required fields', () => {
    const schema = TOOL_SCHEMAS.find((t) => t.name === 'recall_knowledge')
    expect(schema).toBeDefined()
    expect(schema?.inputSchema.required).toContain('query')
    const props = schema!.inputSchema.properties as Record<string, unknown>
    expect(props['query']).toBeDefined()
    expect(props['confidence_floor']).toBeDefined()
    expect(props['include_superseded']).toBeDefined()
    expect(props['graph_hops']).toBeDefined()
  })

  it('keeps recall_memory visible as an alias surface (back-compat)', () => {
    expect(TOOL_SCHEMAS.some((t) => t.name === 'recall_memory')).toBe(true)
  })
})
