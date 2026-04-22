import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getDb, getReranker } from 'fulcrum-agent-core'
import {
  createTestDb,
  resetTestDb,
  seedWorkspaceAndProject,
  registerStubEmbedder,
  unregisterStubEmbedder,
} from './helpers.js'
import { runMigration101MemoryV3Lifecycle } from '../schema.js'
import { createCuratedPage } from '../l1/page.js'
import { recordL1Embedding } from '../l2/embed.js'
import { flushPendingMemoryWrites } from '../l2/queue.js'
import { runV3Search } from '../retrieval/v3-search.js'
import type { CuratedPage } from '../l1/frontmatter.js'

vi.mock('fulcrum-agent-core', async () => {
  const actual = await vi.importActual<typeof import('fulcrum-agent-core')>('fulcrum-agent-core')
  return {
    ...actual,
    getReranker: vi.fn().mockReturnValue(null),
  }
})

let tmpVault: string
let prevVaultEnv: string | undefined

beforeEach(async () => {
  vi.mocked(getReranker).mockReturnValue(null)
  createTestDb()
  runMigration101MemoryV3Lifecycle(getDb())
  seedWorkspaceAndProject(getDb(), 'ws_exp', 'proj_exp')
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-recall-explain-'))
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
  await registerStubEmbedder()
})

afterEach(() => {
  unregisterStubEmbedder()
  resetTestDb()
  vi.clearAllMocks()
  rmSync(tmpVault, { recursive: true, force: true })
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
})

function seedRawSource(sourceId: string): void {
  getDb()
    .prepare(
      `INSERT INTO l0_sources (source_id, source_type, workspace_id, project_id, vault_path, content_hash, size_bytes, created_at)
       VALUES (?, 'bash_trace', 'ws_exp', 'proj_exp', ?, ?, 12, '2026-04-22T10:00:00Z')`,
    )
    .run(sourceId, `raw/bash_trace/2026/04/22/${sourceId}.md`, `hash-${sourceId}`)
}

function seedPage(id: string, body: string, sources: string[], confidence = 0.8): CuratedPage {
  const now = '2026-04-22T10:00:00Z'
  const page: CuratedPage = {
    id,
    schema: 'fulcrum.memory/v3',
    type: 'page',
    title: `Page ${id}`,
    confidence,
    first_seen: now,
    last_confirmed: now,
    retention_tier: 'working',
    access_count: 0,
    sources,
    sources_via: [],
    supersedes: [],
    superseded_by: null,
    entities: [],
    workspace_id: 'ws_exp',
    project_id: 'proj_exp',
    body,
  }
  return createCuratedPage(page)
}

describe('runV3Search explain output', () => {
  it('returns stable schema with retrieval stages, runtime, trust, and sources', async () => {
    seedRawSource('01EXP_SRC')
    seedPage(
      '01EXP_MEM',
      '# Auth\n\nAuth middleware records token checks. [[raw/bash_trace/2026/04/22/01EXP_SRC]]\n',
      ['01EXP_SRC'],
    )
    recordL1Embedding(getDb(), '01EXP_MEM')
    await flushPendingMemoryWrites(5_000)

    const hits = await runV3Search({
      workspace_id: 'ws_exp',
      project_id: 'proj_exp',
      query: 'auth middleware',
      explain: true,
    })

    const hit = hits.find((row) => row.memory_id === '01EXP_MEM')!
    expect(hit.explanation).toBeDefined()
    expect(hit.explanation).toMatchObject({
      result_id: '01EXP_MEM',
      result_type: 'memory',
      stage_ranks: {
        fts: expect.any(Number),
        vector: null,
        graph: null,
        reranker: null,
      },
      stage_scores: {
        fts: expect.any(Number),
        vector: null,
        graph: null,
        reranker: null,
        fused: expect.any(Number),
      },
      runtime: {
        provider: expect.any(String),
        model: expect.any(String),
        requested_device: expect.any(String),
        actual_device: expect.any(String),
        fallback_reason: null,
        latency_ms: expect.any(Number),
      },
      trust: {
        provenance_class: 'raw-backed',
        confidence: 0.8,
        freshness: 1,
        supersession: 'current',
      },
    })
    expect(hit.explanation!.sources).toContainEqual(
      expect.objectContaining({
        kind: 'raw',
        source_id: '01EXP_SRC',
        path: 'raw/bash_trace/2026/04/22/01EXP_SRC.md',
        status: 'resolved',
      }),
    )
  })
})
