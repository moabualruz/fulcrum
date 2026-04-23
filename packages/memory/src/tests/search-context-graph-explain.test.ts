import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { persistGraphEvidenceUnit } from '../graph/evidence.js'
import { readRagQueryTrace } from '../retrieval/query-trace.js'
import { searchContext } from '../retrieval/search-context.js'

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  resetTestDb()
})

describe('searchContext graph explain contribution', () => {
  it('records graph contribution details in result explanations and query trace fusion metadata', async () => {
    const seed = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'entity',
      domain: 'decision',
      relationship_type: 'represents',
      name: 'Graph decision evidence',
      source_refs: [],
      confidence: 0.9,
      freshness: 'current',
    })
    const fix = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'entity',
      domain: 'fix',
      relationship_type: 'represents',
      name: 'Graph fix evidence',
      source_refs: [],
      confidence: 0.85,
      freshness: 'current',
    })
    const edge = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'edge',
      domain: 'fix',
      relationship_type: 'fixed_by',
      from_id: seed.graph_unit_id,
      to_id: fix.graph_unit_id,
      source_refs: [],
      confidence: 0.75,
      freshness: 'current',
    })

    const response = await searchContext({
      query: 'graph decision',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      limit: 10,
      context_budget_tokens: 1000,
      persist: true,
      include_graph: true,
      graph_mode: 'local',
      explain: true,
    })

    expect(response.results.find(result => result.source_ref.graph_id === edge.graph_unit_id)?.stage_contributions)
      .toEqual(expect.arrayContaining([expect.objectContaining({ stage: 'graph_local' })]))
    expect(response.graph_contributions).toEqual([
      expect.objectContaining({
        mode: 'local',
        seed_ids: [seed.graph_unit_id],
        contributed_result_ids: expect.arrayContaining([edge.graph_unit_id, fix.graph_unit_id]),
        changed_candidates: true,
        changed_context_pack: true,
      }),
    ])

    const trace = readRagQueryTrace({
      query_trace_id: response.query_trace_id,
      workspace_id: 'ws_1',
      project_id: 'proj_1',
    })
    expect(trace?.graph_contributions).toEqual(response.graph_contributions)
    expect(JSON.stringify(trace)).not.toContain('/home/')
  })
})
