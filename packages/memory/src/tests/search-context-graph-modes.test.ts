import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { persistGraphEvidenceUnit } from '../graph/evidence.js'
import { searchContext } from '../retrieval/search-context.js'

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  resetTestDb()
})

describe('searchContext graph modes', () => {
  it('rejects invalid graph modes instead of silently using local expansion', async () => {
    await expect(searchContext({
      query: 'graph repair',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      include_graph: true,
      graph_mode: 'global-summary' as 'local',
    })).rejects.toMatchObject({
      code: 'invalid_graph_mode',
      retryable: false,
    })
  })

  it('gates global-summary mode when graph summary assets are unavailable', async () => {
    const response = await searchContext({
      query: 'global repair graph summary',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      limit: 5,
      include_graph: true,
      graph_mode: 'global_summary',
      explain: true,
    })

    expect(response.results).toEqual([])
    expect(response.skipped_stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'graph_global_summary', reason: expect.stringContaining('unavailable') }),
    ]))
  })

  it('uses global-summary assets when they are present', async () => {
    const summary = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'summary',
      domain: 'memory',
      relationship_type: 'summarizes',
      name: 'RAG graph global summary',
      summary_id: 'summary_graph_global',
      summary: 'Global summary: graph repair connects tasks, files, symbols, errors, and fixes.',
      source_refs: [],
      confidence: 0.86,
      freshness: 'current',
    })

    const response = await searchContext({
      query: 'graph repair tasks files symbols',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      limit: 5,
      include_graph: true,
      graph_mode: 'global_summary',
      explain: true,
    })

    expect(response.results[0]).toMatchObject({
      type: 'graph_entity',
      source_ref: { graph_id: summary.graph_unit_id },
    })
    expect(response.results[0]?.stage_contributions.map(stage => stage.stage)).toContain('graph_global_summary')
  })

  it('gates drift-style mode until both global summary and local relationship assets exist', async () => {
    const withoutAssets = await searchContext({
      query: 'drift repair relationship',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      limit: 5,
      include_graph: true,
      graph_mode: 'drift',
      explain: true,
    })
    expect(withoutAssets.skipped_stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'graph_drift', reason: expect.stringContaining('unavailable') }),
    ]))

    const summary = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'summary',
      domain: 'memory',
      relationship_type: 'summarizes',
      name: 'Drift repair summary',
      summary_id: 'summary_graph_drift',
      summary: 'Drift summary for repair relationship evidence.',
      source_refs: [],
      confidence: 0.8,
      freshness: 'current',
    })
    const task = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'entity',
      domain: 'task',
      relationship_type: 'represents',
      name: 'Drift repair task',
      source_refs: [],
      confidence: 0.9,
      freshness: 'current',
    })
    persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'edge',
      domain: 'task',
      relationship_type: 'drift_links',
      from_id: summary.graph_unit_id,
      to_id: task.graph_unit_id,
      source_refs: [],
      confidence: 0.7,
      freshness: 'current',
    })

    const response = await searchContext({
      query: 'drift repair relationship',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      limit: 5,
      include_graph: true,
      graph_mode: 'drift',
      explain: true,
    })

    expect(response.results.some(result => result.source_ref.graph_id === summary.graph_unit_id)).toBe(true)
    expect(response.results.some(result => result.stage_contributions.some(stage => stage.stage === 'graph_drift'))).toBe(true)
    expect(response.skipped_stages.find(stage => stage.stage === 'graph_drift')).toBeUndefined()
  })
})
