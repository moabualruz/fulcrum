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

describe('searchContext graph local neighborhood', () => {
  it('expands bounded one-hop graph neighborhood from matching relationship evidence', async () => {
    const task = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'entity',
      domain: 'task',
      relationship_type: 'represents',
      name: 'RAG repair orchestration task',
      source_refs: [],
      confidence: 0.9,
      freshness: 'current',
    })
    const file = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'entity',
      domain: 'file',
      relationship_type: 'represents',
      name: 'packages/memory/src/setup/rag-repair.ts',
      source_refs: [],
      confidence: 0.9,
      freshness: 'current',
    })
    persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'edge',
      domain: 'task',
      relationship_type: 'touches_file',
      from_id: task.graph_unit_id,
      to_id: file.graph_unit_id,
      source_refs: [],
      confidence: 0.8,
      freshness: 'current',
    })

    const response = await searchContext({
      query: 'repair orchestration',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      limit: 10,
      explain: true,
      include_graph: true,
      graph_mode: 'local',
    })

    expect(response.results.map(result => result.type)).toEqual(expect.arrayContaining(['graph_entity', 'graph_edge']))
    expect(response.results.some(result => result.source_ref.graph_id === file.graph_unit_id)).toBe(true)
    expect(response.results.some(result => result.stage_contributions.some(stage => stage.stage === 'graph_local'))).toBe(true)
    expect(response.graph_contributions).toEqual([
      expect.objectContaining({
        mode: 'local',
        seed_count: 1,
        expanded_entities: 2,
        expanded_edges: 1,
        changed_candidates: true,
      }),
    ])
  })

  it('does not apply graph candidate scoring when graph is disabled', async () => {
    const graph = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'entity',
      domain: 'memory',
      relationship_type: 'represents',
      name: 'Graph-only boost term',
      source_refs: [{ source_domain: 'memory', source_id: 'mem_graph_boost', project_id: 'proj_1' }],
      confidence: 0.9,
      freshness: 'current',
    })
    const db = (await import('fulcrum-agent-core')).getDb()
    db.prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, title, summary, entities, provenance
      ) VALUES (
        'mem_graph_boost', 'ws_1', 'proj_1', 'fact', 'project',
        'Plain lexical candidate.', 'hash-graph-boost',
        3, 'Plain candidate', 'plain only', ?, '{}'
      )
    `).run(JSON.stringify([graph.graph_unit_id]))

    const response = await searchContext({
      query: 'plain boost',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      limit: 5,
      include_graph: false,
      explain: true,
    })

    expect(response.results[0]?.source_ref.source_id).toBe('mem_graph_boost')
    expect(response.results[0]?.stage_contributions.map(stage => stage.stage)).not.toContain('graph')
    expect(response.skipped_stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'graph', reason: expect.stringContaining('disabled') }),
    ]))
  })

  it('honors graph_depth for bounded local expansion', async () => {
    const task = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'entity',
      domain: 'task',
      relationship_type: 'represents',
      name: 'Depth repair task',
      source_refs: [],
      freshness: 'current',
    })
    const file = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'entity',
      domain: 'file',
      relationship_type: 'represents',
      name: 'Nested file evidence',
      source_refs: [],
      freshness: 'current',
    })
    const symbol = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'entity',
      domain: 'symbol',
      relationship_type: 'represents',
      name: 'NestedSymbol',
      source_refs: [],
      freshness: 'current',
    })
    persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'edge',
      domain: 'task',
      relationship_type: 'touches_file',
      from_id: task.graph_unit_id,
      to_id: file.graph_unit_id,
      source_refs: [],
      freshness: 'current',
    })
    persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'edge',
      domain: 'symbol',
      relationship_type: 'declares_symbol',
      from_id: file.graph_unit_id,
      to_id: symbol.graph_unit_id,
      source_refs: [],
      freshness: 'current',
    })

    const disabled = await searchContext({
      query: 'depth repair',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      include_graph: true,
      graph_mode: 'local',
      graph_depth: 0,
      limit: 10,
    })
    expect(disabled.results.some(result => result.source_ref.graph_id === file.graph_unit_id)).toBe(false)

    const oneHop = await searchContext({
      query: 'depth repair',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      include_graph: true,
      graph_mode: 'local',
      graph_depth: 1,
      limit: 10,
    })
    expect(oneHop.results.some(result => result.source_ref.graph_id === file.graph_unit_id)).toBe(true)
    expect(oneHop.results.some(result => result.source_ref.graph_id === symbol.graph_unit_id)).toBe(false)

    const twoHop = await searchContext({
      query: 'depth repair',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      include_graph: true,
      graph_mode: 'local',
      graph_depth: 2,
      limit: 10,
    })
    expect(twoHop.results.some(result => result.source_ref.graph_id === symbol.graph_unit_id)).toBe(true)
  })

  it('suppresses failed graph evidence from relationship search results', async () => {
    const failed = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'entity',
      domain: 'task',
      relationship_type: 'represents',
      name: 'Deleted task graph evidence',
      source_refs: [{ source_domain: 'task', source_id: 'task_deleted_missing', project_id: 'proj_1' }],
      freshness: 'current',
    })

    const response = await searchContext({
      query: 'deleted task graph evidence',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      include_graph: true,
      limit: 10,
    })

    expect(response.results.some(result => result.source_ref.graph_id === failed.graph_unit_id)).toBe(false)
  })

  it('returns one explicit graph-disabled skipped stage', async () => {
    const response = await searchContext({
      query: 'anything',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      include_graph: false,
      limit: 10,
    })

    expect(response.skipped_stages.filter(stage => stage.stage === 'graph')).toEqual([
      { stage: 'graph', reason: 'graph expansion disabled' },
    ])
  })

  it('expands endpoints when the top local seed is an edge', async () => {
    const source = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'entity',
      domain: 'task',
      relationship_type: 'represents',
      name: 'Endpoint source',
      source_refs: [],
      freshness: 'current',
    })
    const target = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'entity',
      domain: 'file',
      relationship_type: 'represents',
      name: 'Endpoint target',
      source_refs: [],
      freshness: 'current',
    })
    persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'edge',
      domain: 'task',
      relationship_type: 'edge_seed_unique_relationship',
      from_id: source.graph_unit_id,
      to_id: target.graph_unit_id,
      source_refs: [],
      freshness: 'current',
    })

    const response = await searchContext({
      query: 'edge seed unique relationship',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      include_graph: true,
      graph_mode: 'local',
      graph_depth: 1,
      limit: 10,
    })

    expect(response.results.some(result => result.source_ref.graph_id === source.graph_unit_id)).toBe(true)
    expect(response.results.some(result => result.source_ref.graph_id === target.graph_unit_id)).toBe(true)
  })
})
