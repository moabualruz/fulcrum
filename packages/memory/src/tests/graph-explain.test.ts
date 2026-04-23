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
import { upsertEntity, addEdge } from '../l1/entities.js'
import { createCuratedPage } from '../l1/page.js'
import { recordL1Embedding } from '../l2/embed.js'
import { flushPendingMemoryWrites } from '../l2/queue.js'
import { runV3Search } from '../retrieval/v3-search.js'

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
  seedWorkspaceAndProject(getDb(), 'ws_graph_explain', 'proj_graph_explain')
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-graph-explain-'))
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

describe('graph explain output', () => {
  it('describes graph contribution when graph expansion surfaces a result', async () => {
    const reactId = upsertEntity({ workspace_id: 'ws_graph_explain', entity_type: 'library', name: 'React' })
    const hookId = upsertEntity({ workspace_id: 'ws_graph_explain', entity_type: 'concept', name: 'useState' })
    addEdge({ workspace_id: 'ws_graph_explain', source_id: reactId, target_id: hookId, relation: 'provides' })

    createCuratedPage({
      id: '01GRAPH_EXPLAIN',
      schema: 'fulcrum.memory/v3',
      type: 'page',
      title: 'Hook page',
      confidence: 0.8,
      first_seen: '2026-04-22T10:00:00Z',
      last_confirmed: '2026-04-22T10:00:00Z',
      retention_tier: 'working',
      access_count: 0,
      sources: [],
      sources_via: ['01GRAPH_SEED'],
      supersedes: [],
      superseded_by: null,
      entities: [hookId],
      workspace_id: 'ws_graph_explain',
      project_id: 'proj_graph_explain',
      body: '# Hook state\n\nComponent-local state storage.\n',
    })
    recordL1Embedding(getDb(), '01GRAPH_EXPLAIN')
    await flushPendingMemoryWrites(5_000)

    const out = await runV3Search({
      workspace_id: 'ws_graph_explain',
      project_id: 'proj_graph_explain',
      query: 'React',
      explain: true,
    })

    const hit = out.find((r) => r.memory_id === '01GRAPH_EXPLAIN')!
    expect(hit.explanation!.stage_ranks.graph).toBeGreaterThan(0)
    expect(hit.explanation!.graph_contribution).toMatchObject({
      contributed: true,
      hops: 2,
      rank: hit.explanation!.stage_ranks.graph,
      seed_entity_ids: [reactId],
      matched_entity_ids: [hookId],
    })
  })
})
