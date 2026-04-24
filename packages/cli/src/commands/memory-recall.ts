// packages/cli/src/commands/memory-recall.ts
//
// Memory v3 PR 5 unit 5.3 — `fulcrum memory recall` CLI + `recall_knowledge`
// MCP handler.
//
// Thin wrapper over runV3Search that keeps the operator surface stable:
//   * workspace_id / project_id default to CWD context (callers pass through).
//   * content truncated to max_chars (default 500) so JSON stdout stays compact.
//   * Every hit carries sources[] + l0_wikilinks[] so `fulcrum memory sources`
//     (PR 5.4) can render provenance without re-reading the row.
//
// PR 5.5 flipped `recall_memory` to delegate here by default; PR 9.5 retired
// the FULCRUM_MEMORY_V3 flag and removed the legacy fallback entirely — this
// handler is now the only recall path for both names.

import { getDb, type Db } from 'fulcrum-agent-core'
import { runV3Search, type RagRecallExplanation, type V3RecallHit, type V3SearchInput } from 'fulcrum-memory'

export interface RecallKnowledgeInput {
  workspace_id: string
  project_id?: string | null
  query: string
  limit?: number
  offset?: number
  confidence_floor?: number
  graph_hops?: number
  include_superseded?: boolean
  max_chars?: number
  explain?: boolean
}

export interface RecallKnowledgeHit {
  memory_id: string
  title: string
  content: string
  confidence: number
  score: number
  sources: string[]
  l0_wikilinks: string[]
  retention_tier: string
  stage_ranks: V3RecallHit['stage_ranks']
  explanation?: RagRecallExplanation
}

export interface RecallReadiness {
  status: 'ready' | 'degraded' | 'not_seeded'
  seeded: boolean
  searchable_rows: number
  memory_rows: number
  l0_rows: number
  current_vector_rows: number
  graph_entities: number
  graph_edges: number
  degraded_stages: string[]
  next_actions: string[]
}

export interface RecallKnowledgeResult {
  results: RecallKnowledgeHit[]
  reason?: 'no_match' | 'not_seeded'
  readiness?: RecallReadiness
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n)
}

function count(db: Db, sql: string, ...params: unknown[]): number {
  try {
    const row = db.prepare(sql).get(...params) as { n: number } | undefined
    return row?.n ?? 0
  } catch {
    return 0
  }
}

function scopedWhere(projectId: string | null | undefined, tableAlias = ''): { sql: string; params: unknown[] } {
  const prefix = tableAlias ? `${tableAlias}.` : ''
  const clauses = [`${prefix}workspace_id = ?`]
  const params: unknown[] = []
  if (projectId === null) clauses.push(`${prefix}project_id IS NULL`)
  else if (projectId !== undefined) {
    clauses.push(`(${prefix}project_id = ? OR ${prefix}project_id IS NULL)`)
    params.push(projectId)
  }
  return { sql: clauses.join(' AND '), params }
}

export function assessRecallReadiness(input: {
  workspace_id: string
  project_id?: string | null
  confidence_floor?: number
  include_superseded?: boolean
}, db: Db = getDb()): RecallReadiness {
  const floor = input.confidence_floor ?? 0.3
  const scope = scopedWhere(input.project_id)
  const memoryJoinScope = scopedWhere(input.project_id, 'm')
  const memoryParams = [input.workspace_id, ...scope.params]
  const memoryRows = count(db, `SELECT COUNT(*) AS n FROM memories WHERE ${scope.sql}`, ...memoryParams)
  const l0Rows = count(db, `SELECT COUNT(*) AS n FROM l0_sources WHERE ${scope.sql}`, ...memoryParams)
  const supersessionClause = input.include_superseded ? '' : 'AND superseded_by IS NULL'
  const searchableRows = count(db, `
    SELECT COUNT(*) AS n
      FROM memories
     WHERE ${scope.sql}
       AND schema_version >= 3
       AND confidence >= ?
       ${supersessionClause}
  `, ...memoryParams, floor)
  const currentVectorRows = count(db, `
    SELECT COUNT(*) AS n
      FROM vector_metadata v
      JOIN memories m
        ON m.workspace_id = v.workspace_id
       AND m.memory_id = v.source_id
     WHERE ${memoryJoinScope.sql}
       AND v.source_domain = 'memory'
       AND v.status = 'current'
  `, input.workspace_id, ...memoryJoinScope.params)
  const graphEntities = count(db, 'SELECT COUNT(*) AS n FROM graph_entities WHERE workspace_id = ?', input.workspace_id)
  const graphEdges = count(db, 'SELECT COUNT(*) AS n FROM graph_edges WHERE workspace_id = ?', input.workspace_id)

  const degradedStages: string[] = []
  if (searchableRows === 0) degradedStages.push('l1')
  if (currentVectorRows === 0) degradedStages.push('vectors')
  if (graphEntities === 0 && graphEdges === 0) degradedStages.push('graph')

  const nextActions: string[] = []
  if (searchableRows === 0) {
    nextActions.push('Seed curated L1 memory before recall, for example by running memory ingest/curation or a scoped RAG rebuild.')
  }
  if (currentVectorRows === 0) nextActions.push('Run memory embedding for the workspace/project before relying on semantic recall.')
  if (graphEntities === 0 && graphEdges === 0) nextActions.push('Run graph rebuild before relying on graph-assisted recall.')

  const seeded = searchableRows > 0
  return {
    status: !seeded ? 'not_seeded' : degradedStages.length > 0 ? 'degraded' : 'ready',
    seeded,
    searchable_rows: searchableRows,
    memory_rows: memoryRows,
    l0_rows: l0Rows,
    current_vector_rows: currentVectorRows,
    graph_entities: graphEntities,
    graph_edges: graphEdges,
    degraded_stages: degradedStages,
    next_actions: nextActions,
  }
}

export async function recallKnowledge(input: RecallKnowledgeInput, db: Db = getDb()): Promise<RecallKnowledgeResult> {
  const maxChars = input.max_chars ?? 500
  const readiness = assessRecallReadiness(input, db)
  if (!readiness.seeded) return { results: [], reason: 'not_seeded', readiness }
  const searchInput: V3SearchInput = {
    workspace_id: input.workspace_id,
    query: input.query,
  }
  if (input.project_id !== undefined) searchInput.project_id = input.project_id
  if (input.limit !== undefined) searchInput.limit = input.limit
  if (input.offset !== undefined) searchInput.offset = input.offset
  if (input.confidence_floor !== undefined) searchInput.confidence_floor = input.confidence_floor
  if (input.graph_hops !== undefined) searchInput.graph_hops = input.graph_hops
  if (input.include_superseded !== undefined) searchInput.include_superseded = input.include_superseded
  if (input.explain !== undefined) searchInput.explain = input.explain

  const hits = await runV3Search(searchInput, db)
  if (hits.length === 0) return { results: [], reason: 'no_match', readiness }

  const results: RecallKnowledgeHit[] = hits.map((h) => {
    const result: RecallKnowledgeHit = {
      memory_id: h.memory_id,
      title: h.title,
      content: truncate(h.content, maxChars),
      confidence: h.confidence,
      score: h.score,
      sources: h.sources,
      l0_wikilinks: h.l0_wikilinks,
      retention_tier: h.retention_tier,
      stage_ranks: h.stage_ranks,
    }
    if (input.explain && h.explanation) result.explanation = h.explanation
    return result
  })
  return { results, readiness }
}
