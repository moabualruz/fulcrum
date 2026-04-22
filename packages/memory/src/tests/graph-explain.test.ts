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
import { upsertEntity, addEdge } from '../l1/entities.js'
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
  seedWorkspaceAndProject(getDb(), 'ws_graph_exp', 'proj_graph_exp')
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

function seedPage(id: string, body: string, sources: string[], entities: string[]): CuratedPage {
  const now = '2026-04-22T12:00:00Z'
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
    entities,
    workspace_id: 'ws_graph_exp',
    project_id: 'proj_graph_exp',
    body,
  })
}

describe('graph contribution explanations', () => {
  it('reports graph contribution when graph expansion affects recall results', async () => {
    const reactId = upsertEntity({ workspace_id: 'ws_graph_exp', entity_type: 'library', name: 'React' })
    const hookId = upsertEntity({ workspace_id: 'ws_graph_exp', entity_type: 'concept', name: 'useState' })
    addEdge({ workspace_id: 'ws_graph_exp', source_id: reactId, target_id: hookId, relation: 'provides' })

    seedPage(
      '01GRAPH_PAGE',
      '# Hook memory\n\nStores component-local state. [[raw/bash_trace/2026/04/22/01GRAPH_SRC]]\n',
      ['01GRAPH_SRC'],
      [hookId],
    )
    recordL1Embedding(getDb(), '01GRAPH_PAGE')
    await flushPendingMemoryWrites(5_000)

    const hits = await runV3Search({
      workspace_id: 'ws_graph_exp',
      project_id: 'proj_graph_exp',
      query: 'React',
      explain: true,
    })

    const hit = hits.find((row) => row.memory_id === '01GRAPH_PAGE')!
    expect(hit).toBeDefined()
    expect(hit.explanation?.stage_ranks.graph).toBe(1)
    expect(hit.explanation?.stage_scores.graph).toBeGreaterThan(0)
    expect(hit.explanation?.graph_contribution).toMatchObject({
      affected: true,
      hops: 2,
      seed_entity_ids: [reactId],
      matched_entity_ids: [hookId],
      rank: 1,
    })
    expect(hit.explanation?.graph_contribution?.reached_entity_ids).toEqual(expect.arrayContaining([reactId, hookId]))
  })
})
