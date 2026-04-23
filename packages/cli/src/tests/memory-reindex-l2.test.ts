// packages/cli/src/tests/memory-reindex-l2.test.ts
//
// Memory v3 PR 4 unit 4.3 — `fulcrum memory reindex-l2 [--pages|--code]`.
//
// Exercises the full command function with a deterministic stub embedder
// and real vec_memories / vec_chunks virtual tables. Covers:
//   * --pages only re-embeds L1 (schema_version >= 3) rows; vec_chunks
//     stays empty.
//   * --code only re-embeds code_chunks; vec_memories stays empty.
//   * Default (no flag) reindexes both scopes.
//   * `COUNT(*) FROM vec_memories == L1 page count` — the plan's Verify
//     gate for PR 4.
//   * Returning scanned / embedded / failed counters per scope.

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
  type CuratedPage,
} from 'fulcrum-memory'
import { reindexL2 } from '../commands/memory-reindex-l2.js'

const STUB_DIM = 1024

class StubEmbeddingProvider {
  dimensions = STUB_DIM
  async warmUp(): Promise<void> { /* no-op */ }
  async embed(text: string): Promise<Float32Array> { return this.embedDocument(text) }
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map((t) => this.embedDocument(t)))
  }
  async embedDocument(text: string): Promise<Float32Array> {
    const vec = new Float32Array(STUB_DIM)
    for (let i = 0; i < text.length; i++) {
      vec[i % STUB_DIM] = (vec[i % STUB_DIM] ?? 0) + text.charCodeAt(i) / 1024
    }
    return vec
  }
}

async function installStubEmbedder(): Promise<void> {
  registerEmbeddingProvider('fulcrum-test-stub', () => new StubEmbeddingProvider())
  await initEmbedding({
    workspace_id: 'test',
    project_id: 'test',
    port: 0,
    embedding: {
      text: { provider: 'fulcrum-test-stub' as 'custom', model: 'stub' },
      code: null,
    },
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
  db.prepare("INSERT OR IGNORE INTO workspaces(workspace_id, name) VALUES (?, ?)").run('ws_rx', 'ws_rx')
  db.prepare("INSERT OR IGNORE INTO projects(project_id, workspace_id, name) VALUES (?, ?, ?)").run('proj_rx', 'ws_rx', 'proj_rx')
  setDb(db)
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-reindex-l2-'))
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
  await installStubEmbedder()
})

afterEach(() => {
  resetProviders()
  closeDb()
  rmSync(tmpVault, { recursive: true, force: true })
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
})

function seedPage(id: string, body = `# Page ${id}\n\n[[raw/bash_trace/2026/04/18/01KL0_ALPHA]]\n`): CuratedPage {
  const now = '2026-04-18T10:00:00Z'
  const page: CuratedPage = {
    id,
    schema: 'fulcrum.memory/v3',
    type: 'page',
    title: `Page ${id}`,
    confidence: 0.5,
    first_seen: now,
    last_confirmed: now,
    retention_tier: 'working',
    access_count: 0,
    sources: ['01KL0_ALPHA'],
    sources_via: [],
    supersedes: [],
    superseded_by: null,
    entities: [],
    workspace_id: 'ws_rx',
    project_id: 'proj_rx',
    body,
  }
  return createCuratedPage(page)
}

function seedCodeChunk(id: string, content: string): void {
  const db = getDb()
  db.prepare(`INSERT INTO code_chunks (
    chunk_id, workspace_id, project_id, file_path, chunk_strategy, source_type,
    content, start_line, end_line
  ) VALUES (?, ?, ?, ?, 'syntax', 'code', ?, 1, 1)
  `).run(id, 'ws_rx', 'proj_rx', '/tmp/' + id + '.ts', content)
}

function vecMemCount(): number {
  return (getDb().prepare('SELECT COUNT(*) AS n FROM vec_memories').get() as { n: number }).n
}

function vecChunkCount(): number {
  return (getDb().prepare('SELECT COUNT(*) AS n FROM vec_chunks').get() as { n: number }).n
}

describe('reindexL2 — scope selection (PR 4.3)', () => {
  it('--pages embeds every v3 page and leaves code_chunks untouched', async () => {
    seedPage('01KRX_P1')
    seedPage('01KRX_P2')
    seedPage('01KRX_P3')
    seedCodeChunk('chunk_A', 'function a() {}')

    const result = await reindexL2({ pages: true })
    expect(result.pages.scanned).toBe(3)
    expect(result.pages.embedded).toBe(3)
    expect(result.pages.failed).toBe(0)
    // PR 4 Verify gate: vec_memories count equals L1 page count.
    expect(vecMemCount()).toBe(3)

    expect(result.code.scanned).toBe(0)
    expect(result.code.embedded).toBe(0)
    expect(vecChunkCount()).toBe(0)
  })

  it('--code embeds every code_chunks row and leaves vec_memories untouched', async () => {
    seedPage('01KRX_P1')
    seedCodeChunk('chunk_A', 'function a() {}')
    seedCodeChunk('chunk_B', 'function b() {}')

    const result = await reindexL2({ code: true })
    expect(result.pages.scanned).toBe(0)
    expect(result.pages.embedded).toBe(0)
    expect(vecMemCount()).toBe(0)

    expect(result.code.scanned).toBe(2)
    expect(result.code.embedded).toBe(2)
    expect(result.code.failed).toBe(0)
    expect(vecChunkCount()).toBe(2)
  })

  it('default (no flag) reindexes both scopes', async () => {
    seedPage('01KRX_P1')
    seedPage('01KRX_P2')
    seedCodeChunk('chunk_A', 'function a() {}')

    const result = await reindexL2({})
    expect(result.pages.embedded).toBe(2)
    expect(result.code.embedded).toBe(1)
    expect(vecMemCount()).toBe(2)
    expect(vecChunkCount()).toBe(1)
  })

  it('replays safely — repeat run overwrites existing vec rows without duplicate errors', async () => {
    seedPage('01KRX_P1')
    await reindexL2({ pages: true })
    expect(vecMemCount()).toBe(1)

    const second = await reindexL2({ pages: true })
    expect(second.pages.failed).toBe(0)
    expect(vecMemCount()).toBe(1)
  })

  it('only counts schema_version >= 3 rows for --pages', async () => {
    // Seed a pre-v3 row manually with schema_version=1 to prove the query
    // predicate is pinned.
    const db = getDb()
    const now = new Date().toISOString()
    db.prepare(`INSERT INTO memories (
      memory_id, workspace_id, project_id, scope, kind, title, summary, content,
      tags, entities, confidence, importance, freshness, content_hash,
      source, content_type, tier, slug, vault_path, provenance,
      schema_version, created_at, updated_at, last_accessed_at, access_count
    ) VALUES (?, ?, ?, 'project', 'fact', ?, '', '', '[]', '[]', 0.5, 0.5, 1.0, 'abc',
              'legacy', 'text', 'short_term', ?, 'legacy/path.md', '{}', 1, ?, ?, ?, 0)
    `).run('mem_LEGACY', 'ws_rx', 'proj_rx', 'legacy', 'mem_LEGACY', now, now, now)
    seedPage('01KRX_V3_ONLY')

    const result = await reindexL2({ pages: true })
    expect(result.pages.scanned).toBe(1) // legacy ignored
    expect(result.pages.embedded).toBe(1)
    expect(vecMemCount()).toBe(1)
  })

  it('counts page embeddings as failed when no vector row is verified', async () => {
    seedPage('01KRX_NO_EMBEDDER')
    resetProviders()

    const result = await reindexL2({ pages: true })

    expect(result.pages.scanned).toBe(1)
    expect(result.pages.embedded).toBe(0)
    expect(result.pages.failed).toBe(1)
    expect(vecMemCount()).toBe(0)
  })

  it('does not count stale existing page vectors as fresh success', async () => {
    seedPage('01KRX_STALE_VECTOR')
    await reindexL2({ pages: true })
    expect(vecMemCount()).toBe(1)
    resetProviders()

    const result = await reindexL2({ pages: true })

    expect(result.pages.scanned).toBe(1)
    expect(result.pages.embedded).toBe(0)
    expect(result.pages.failed).toBe(1)
    expect(vecMemCount()).toBe(0)
  })
})
