import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  createTestDb,
  resetTestDb,
  seedWorkspaceAndProject,
  registerStubEmbedder,
  unregisterStubEmbedder,
} from './helpers.js'
import { getDb, getReranker } from 'fulcrum-agent-core'
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
  seedWorkspaceAndProject(getDb(), 'ws_explain', 'proj_explain')
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

function seedPage(id: string, body: string, sources: string[] = ['src_recall_explain']): CuratedPage {
  const now = '2026-04-22T10:00:00Z'
  return createCuratedPage({
    id,
    schema: 'fulcrum.memory/v3',
    type: 'page',
    title: `Page ${id}`,
    confidence: 0.8,
    first_seen: now,
    last_confirmed: now,
    retention_tier: 'working',
    access_count: 0,
    sources,
    sources_via: [],
    supersedes: [],
    superseded_by: null,
    entities: [],
    workspace_id: 'ws_explain',
    project_id: 'proj_explain',
    body,
  })
}

describe('recall explain output', () => {
  it('returns stable ranks, scores, runtime, trust, and source fields when requested', async () => {
    seedPage(
      '01EXPLAIN_A',
      '# Auth\n\nAuth middleware explain target. [[raw/bash_trace/2026/04/22/src_recall_explain]]\n',
    )
    recordL1Embedding(getDb(), '01EXPLAIN_A')
    await flushPendingMemoryWrites(5_000)

    const out = await runV3Search({
      workspace_id: 'ws_explain',
      project_id: 'proj_explain',
      query: 'auth middleware',
      explain: true,
    })

    const hit = out.find((r) => r.memory_id === '01EXPLAIN_A')
    expect(hit?.explanation).toBeDefined()
    expect(hit!.explanation!.result_id).toBe('01EXPLAIN_A')
    expect(hit!.explanation!.result_type).toBe('memory')
    expect(hit!.explanation!.stage_ranks.fts).toBeGreaterThan(0)
    expect(hit!.explanation!.stage_ranks.graph).toBeNull()
    expect(hit!.explanation!.stage_scores.fused).toBeGreaterThan(0)
    expect(hit!.explanation!.runtime.provider).toBe('fulcrum-test-stub')
    expect(hit!.explanation!.runtime.model).toBe('stub')
    expect(hit!.explanation!.runtime.requested_device).toBe('auto')
    expect(hit!.explanation!.runtime.actual_device).toBe('cpu')
    expect(hit!.explanation!.runtime.latency_ms).toBeGreaterThanOrEqual(0)
    expect(hit!.explanation!.trust.confidence).toBe(0.8)
    expect(hit!.explanation!.trust.freshness).toBe(1)
    expect(hit!.explanation!.trust.supersession).toBe('current')
    expect(hit!.explanation!.sources.some((s) => s['source_id'] === 'src_recall_explain')).toBe(true)
  })

  it('records reranker rank and score when a reranker contributes', async () => {
    seedPage('01EXPLAIN_DOG', '# Dog\n\nMemory explain dog breed target. [[raw/bash_trace/2026/04/22/src_recall_explain]]\n')
    seedPage('01EXPLAIN_PHYSICS', '# Physics\n\nMemory explain quantum target. [[raw/bash_trace/2026/04/22/src_recall_explain]]\n')
    recordL1Embedding(getDb(), '01EXPLAIN_DOG')
    recordL1Embedding(getDb(), '01EXPLAIN_PHYSICS')
    await flushPendingMemoryWrites(5_000)

    vi.mocked(getReranker).mockReturnValue({
      warmUp: vi.fn(),
      rerank: vi.fn().mockImplementation((_query: string, passages: string[]) => {
        return Promise.resolve(passages.map((passage) => passage.includes('dog breed') ? 9 : -9))
      }),
    })

    const out = await runV3Search({
      workspace_id: 'ws_explain',
      project_id: 'proj_explain',
      query: 'memory explain',
      explain: true,
    })

    expect(out[0]!.memory_id).toBe('01EXPLAIN_DOG')
    expect(out[0]!.explanation!.stage_ranks.reranker).toBe(1)
    expect(out[0]!.explanation!.stage_scores.reranker).toBeGreaterThan(0.99)
  })
})
