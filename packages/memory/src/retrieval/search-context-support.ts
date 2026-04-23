import type { Db } from 'fulcrum-agent-core'
import { readGraphEvidenceUnits, type GraphEvidenceUnit } from '../graph/evidence.js'
import { pathFingerprintForRoadmap, redactRoadmapArtifact } from '../setup/rag-redaction.js'
import type { ContextPack } from './context-pack.js'
import type {
  ContextFreshness,
  ContextSourceReference,
  StageContribution,
  TypedContextResult,
  TypedContextResultType,
} from './context-types.js'
import type {
  SearchContextInput,
  SearchContextResponse,
} from './search-context.js'
import type { BaselineSemanticRanks } from './planner/baseline-lane.js'
import { boundedRankScore, sumStageScores } from './planner/fusion.js'
import type {
  GraphContributionDetail,
  QueryTraceStage,
} from './query-trace.js'

export interface Candidate {
  type: TypedContextResultType
  title: string
  snippet: string
  source_ref: ContextSourceReference
  provenance_class: TypedContextResult['provenance_class']
  freshness: ContextFreshness
  freshness_score: number
  search_text: string
  contextual_text: string
  entity_ids: string[]
  stage_scores: Record<string, number>
}

export const DEFAULT_LIMIT = 10
export const STAGE_CANDIDATE_LIMIT = 50
export const GRAPH_EXPANSION_LIMIT = 25
export const GRAPH_MODES = ['local', 'global_summary', 'drift'] as const

export type SearchGraphMode = typeof GRAPH_MODES[number]

export function scoreCandidates(
  candidates: Candidate[],
  terms: string[],
  graphNames: Map<string, string>,
  semanticRanks: BaselineSemanticRanks,
  includeGraph: boolean,
): void {
  for (const candidate of candidates) {
    candidate.stage_scores['lexical'] = lexicalScore(terms, candidate.search_text)
    candidate.stage_scores['contextual_text'] = lexicalScore(terms, candidate.contextual_text) * 1.4
    candidate.stage_scores['graph'] = includeGraph ? graphContribution(candidate, graphNames, terms) : 0
    candidate.stage_scores['semantic'] = semanticContribution(candidate, semanticRanks)
    const hasQueryEvidence = Object.values(candidate.stage_scores).some(score => score > 0)
    candidate.stage_scores['metadata_freshness'] = hasQueryEvidence ? candidate.freshness_score : 0
  }
}

export function summarizeStages(candidates: Candidate[]): Map<string, { candidate_count: number; limit: number }> {
  const stageSummaries = new Map<string, { candidate_count: number; limit: number }>()
  for (const candidate of candidates) {
    for (const [stage, score] of Object.entries(candidate.stage_scores)) {
      if (score <= 0) continue
      const limit = stage.startsWith('graph_') ? GRAPH_EXPANSION_LIMIT : STAGE_CANDIDATE_LIMIT
      const summary = stageSummaries.get(stage) ?? { candidate_count: 0, limit }
      summary.candidate_count += 1
      stageSummaries.set(stage, summary)
    }
  }
  return stageSummaries
}

function sourceRefForGraphUnit(unit: GraphEvidenceUnit): ContextSourceReference {
  const first = unit.source_refs[0]
  return {
    graph_id: unit.graph_unit_id,
    source_id: first?.source_id ?? unit.graph_unit_id,
    ...(first?.file_path ? { file_path: first.file_path } : {}),
    ...(first?.path_fingerprint ? { path_fingerprint: first.path_fingerprint } : {}),
    ...(first?.line_start !== undefined ? { line_start: first.line_start } : {}),
    ...(first?.line_end !== undefined ? { line_end: first.line_end } : {}),
    ...(first?.symbol_path ? { symbol_path: first.symbol_path } : {}),
    ...(first?.task_id ? { task_id: first.task_id } : {}),
    ...(first?.run_id ? { run_id: first.run_id } : {}),
  }
}

function unitTitle(unit: GraphEvidenceUnit): string {
  return unit.name ?? unit.summary_id ?? unit.relationship_type ?? unit.graph_unit_id
}

function unitSnippet(unit: GraphEvidenceUnit): string {
  if (unit.summary) return unit.summary
  if (unit.kind === 'edge') return `${unit.from_id ?? ''} ${unit.relationship_type} ${unit.to_id ?? ''}`.trim()
  return [unit.domain, unit.relationship_type, unit.name].filter(Boolean).join(' ')
}

function unitSearchText(unit: GraphEvidenceUnit): string {
  return [
    unit.name,
    unit.summary,
    unit.domain,
    unit.relationship_type,
    unit.graph_unit_id,
    unit.from_id,
    unit.to_id,
    JSON.stringify(unit.source_refs),
    JSON.stringify(unit.properties),
  ].map(value => nullableString(value) ?? '').join(' ')
}

export function unitToCandidate(unit: GraphEvidenceUnit, stage?: string, stageScore = 0): Candidate {
  return {
    type: unit.kind === 'edge' ? 'graph_edge' : 'graph_entity',
    title: unitTitle(unit),
    snippet: unitSnippet(unit),
    source_ref: sourceRefForGraphUnit(unit),
    provenance_class: 'graph_backed',
    freshness: unit.freshness === 'current' || unit.freshness === 'stale' || unit.freshness === 'failed' ? unit.freshness : 'unknown',
    freshness_score: unit.freshness === 'current' ? 0.08 : unit.freshness === 'stale' ? 0.02 : 0,
    search_text: unitSearchText(unit),
    contextual_text: '',
    entity_ids: unit.kind === 'edge'
      ? [unit.from_id, unit.to_id].filter((id): id is string => Boolean(id))
      : [unit.graph_unit_id],
    stage_scores: stage ? { [stage]: stageScore } : {},
  }
}

function graphId(candidate: Candidate): string | undefined {
  return candidate.source_ref.graph_id
}

function graphUnitById(units: GraphEvidenceUnit[]): Map<string, GraphEvidenceUnit> {
  return new Map(units.map(unit => [unit.graph_unit_id, unit]))
}

function candidateGraphIds(candidates: Candidate[]): string[] {
  const top = candidates
    .map(candidate => ({ candidate, id: graphId(candidate), score: totalScore(candidate.stage_scores) }))
    .filter((item): item is { candidate: Candidate; id: string; score: number } => Boolean(item.id) && item.score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.title.localeCompare(b.candidate.title))
    .slice(0, 1)
  return Array.from(new Set(top.flatMap(item => [item.id, ...item.candidate.entity_ids])))
}

function existingGraphCandidateMap(candidates: Candidate[]): Map<string, Candidate> {
  const map = new Map<string, Candidate>()
  for (const candidate of candidates) {
    const id = graphId(candidate)
    if (id) map.set(id, candidate)
  }
  return map
}

function mergeGraphCandidateUnits(
  units: GraphEvidenceUnit[],
  existingIds: Set<string>,
  existingById: Map<string, Candidate>,
  stage: 'graph_local' | 'graph_global_summary' | 'graph_drift',
  score: number,
): {
  candidates: Candidate[]
  contributed_result_ids: string[]
  expanded_entities: number
  expanded_edges: number
} {
  const out: Candidate[] = []
  const contributed: string[] = []
  let expandedEntities = 0
  let expandedEdges = 0
  for (const unit of units.slice(0, GRAPH_EXPANSION_LIMIT)) {
    const existing = existingById.get(unit.graph_unit_id)
    if (existing) {
      existing.stage_scores[stage] = Math.max(existing.stage_scores[stage] ?? 0, score)
      contributed.push(unit.graph_unit_id)
      if (unit.kind === 'edge') expandedEdges += 1
      else expandedEntities += 1
      continue
    }
    if (existingIds.has(unit.graph_unit_id)) continue
    existingIds.add(unit.graph_unit_id)
    const candidate = unitToCandidate(unit, stage, score)
    out.push(candidate)
    existingById.set(unit.graph_unit_id, candidate)
    contributed.push(unit.graph_unit_id)
    if (unit.kind === 'edge') expandedEdges += 1
    else expandedEntities += 1
  }
  return {
    candidates: out,
    contributed_result_ids: Array.from(new Set(contributed)),
    expanded_entities: expandedEntities,
    expanded_edges: expandedEdges,
  }
}

function localGraphExpansion(
  graphUnits: GraphEvidenceUnit[],
  seedIds: string[],
  existingIds: Set<string>,
  existingById: Map<string, Candidate>,
  stage: 'graph_local' | 'graph_drift',
  depth = 1,
): { candidates: Candidate[]; expanded_entities: number; expanded_edges: number; contributed_result_ids: string[] } {
  const requestedDepth = Number.isFinite(depth) ? Math.floor(depth) : 1
  const maxDepth = Math.max(0, Math.min(requestedDepth, 3))
  if (maxDepth === 0) {
    return { candidates: [], expanded_entities: 0, expanded_edges: 0, contributed_result_ids: [] }
  }
  const unitMap = graphUnitById(graphUnits)
  const candidateUnits: GraphEvidenceUnit[] = []
  const includedUnits = new Set<string>()
  const visitedNodes = new Set(seedIds)
  let frontier = new Set(seedIds)

  const includeUnit = (unit: GraphEvidenceUnit): void => {
    if (includedUnits.has(unit.graph_unit_id)) return
    includedUnits.add(unit.graph_unit_id)
    candidateUnits.push(unit)
  }

  for (let currentDepth = 0; currentDepth < maxDepth && frontier.size > 0; currentDepth++) {
    const nextFrontier = new Set<string>()
    for (const unit of graphUnits) {
      if (unit.kind !== 'edge') continue
      if (!unit.from_id || !unit.to_id) continue
      if (!frontier.has(unit.from_id) && !frontier.has(unit.to_id)) continue
      includeUnit(unit)
      for (const endpointId of [unit.from_id, unit.to_id]) {
        const endpoint = unitMap.get(endpointId)
        if (endpoint) includeUnit(endpoint)
        if (!visitedNodes.has(endpointId)) {
          visitedNodes.add(endpointId)
          nextFrontier.add(endpointId)
        }
      }
    }
    frontier = nextFrontier
  }

  return mergeGraphCandidateUnits(candidateUnits, existingIds, existingById, stage, stage === 'graph_drift' ? 0.85 : 0.7)
}

function globalSummaryCandidates(
  graphUnits: GraphEvidenceUnit[],
  terms: string[],
  existingIds: Set<string>,
  existingById: Map<string, Candidate>,
  stage: 'graph_global_summary' | 'graph_drift',
): { candidates: Candidate[]; contributed_result_ids: string[]; expanded_entities: number } {
  const merged = mergeGraphCandidateUnits(
    graphUnits
      .filter(unit => unit.kind === 'summary')
      .filter(unit => lexicalScore(terms, unitSearchText(unit)) > 0),
    existingIds,
    existingById,
    stage,
    stage === 'graph_drift' ? 0.9 : 0.8,
  )
  return {
    candidates: merged.candidates,
    contributed_result_ids: merged.contributed_result_ids,
    expanded_entities: merged.expanded_entities,
  }
}

export function expandGraphCandidates(input: {
  input: SearchContextInput
  graphMode: SearchGraphMode
  graphUnits: GraphEvidenceUnit[]
  candidates: Candidate[]
  terms: string[]
}): {
  candidates: Candidate[]
  skipped_stages: Array<{ stage: string; reason: string }>
  graph_contributions: GraphContributionDetail[]
} {
  const existingIds = new Set(input.candidates.map(graphId).filter((id): id is string => Boolean(id)))
  const existingById = existingGraphCandidateMap(input.candidates)
  const seedIds = candidateGraphIds(input.candidates)
  const summaries = input.graphUnits.filter(unit => unit.kind === 'summary')
  const edges = input.graphUnits.filter(unit => unit.kind === 'edge')

  if (input.graphMode === 'global_summary') {
    if (!summaries.length) {
      return {
        candidates: [],
        skipped_stages: [{ stage: 'graph_global_summary', reason: 'graph summary assets unavailable' }],
        graph_contributions: [],
      }
    }
    const global = globalSummaryCandidates(input.graphUnits, input.terms, existingIds, existingById, 'graph_global_summary')
    return {
      candidates: global.candidates,
      skipped_stages: global.contributed_result_ids.length ? [] : [{ stage: 'graph_global_summary', reason: 'no matching graph summary evidence available' }],
      graph_contributions: [{
        mode: 'global_summary',
        seed_count: summaries.length,
        seed_ids: summaries.map(unit => unit.graph_unit_id).slice(0, 5),
        expanded_entities: global.expanded_entities,
        expanded_edges: 0,
        contributed_result_ids: global.contributed_result_ids,
        changed_candidates: global.contributed_result_ids.length > 0,
        changed_ranking: false,
        changed_context_pack: false,
      }],
    }
  }

  if (input.graphMode === 'drift') {
    if (!summaries.length || !edges.length) {
      return {
        candidates: [],
        skipped_stages: [{ stage: 'graph_drift', reason: 'graph summary and local relationship assets unavailable' }],
        graph_contributions: [],
      }
    }
    const summary = globalSummaryCandidates(input.graphUnits, input.terms, existingIds, existingById, 'graph_drift')
    const driftSeedIds = Array.from(new Set([...summary.contributed_result_ids, ...seedIds]
      .filter((id): id is string => Boolean(id))))
      .slice(0, 5)
    const local = localGraphExpansion(input.graphUnits, driftSeedIds, existingIds, existingById, 'graph_drift', input.input.graph_depth ?? 1)
    const candidates = [...summary.candidates, ...local.candidates].slice(0, GRAPH_EXPANSION_LIMIT)
    const contributedIds = Array.from(new Set([...summary.contributed_result_ids, ...local.contributed_result_ids]))
    return {
      candidates,
      skipped_stages: contributedIds.length ? [] : [{ stage: 'graph_drift', reason: 'no matching drift graph evidence available' }],
      graph_contributions: [{
        mode: 'drift',
        seed_count: driftSeedIds.length,
        seed_ids: driftSeedIds,
        expanded_entities: summary.expanded_entities + local.expanded_entities,
        expanded_edges: local.expanded_edges,
        contributed_result_ids: contributedIds,
        changed_candidates: contributedIds.length > 0,
        changed_ranking: false,
        changed_context_pack: false,
      }],
    }
  }

  if (!seedIds.length) {
    return {
      candidates: [],
      skipped_stages: [{ stage: 'graph_local', reason: 'no local graph seed evidence available' }],
      graph_contributions: [],
    }
  }

  const local = localGraphExpansion(input.graphUnits, seedIds, existingIds, existingById, 'graph_local', input.input.graph_depth ?? 1)
  return {
    candidates: local.candidates,
    skipped_stages: local.candidates.length ? [] : [{ stage: 'graph_local', reason: 'no local graph neighbors available' }],
    graph_contributions: [{
      mode: 'local',
      seed_count: seedIds.length,
      seed_ids: seedIds,
      expanded_entities: local.expanded_entities,
      expanded_edges: local.expanded_edges,
      contributed_result_ids: local.contributed_result_ids,
      changed_candidates: local.contributed_result_ids.length > 0,
      changed_ranking: false,
      changed_context_pack: false,
    }],
  }
}

export function finalizeGraphContributions(
  contributions: GraphContributionDetail[],
  results: TypedContextResult[],
  contextPack: ContextPack | undefined,
): GraphContributionDetail[] {
  const resultIds = new Set(results.map(result => result.source_ref.graph_id).filter((id): id is string => Boolean(id)))
  const packedIds = new Set((contextPack?.results ?? []).map(result => result.source_ref.graph_id).filter((id): id is string => Boolean(id)))
  return contributions.map(contribution => ({
    ...contribution,
    changed_ranking: contribution.contributed_result_ids.some(id => resultIds.has(id)),
    changed_context_pack: contribution.contributed_result_ids.some(id => packedIds.has(id)),
  }))
}

export function currentContextualText(
  workspaceId: string,
  projectId: string,
  sourceDomain: string,
  sourceId: string,
  db: Db,
): string {
  const row = db.prepare(`
    SELECT index_text
      FROM contextual_index_records
     WHERE workspace_id = ?
       AND project_id = ?
       AND source_domain = ?
       AND source_id = ?
       AND status = 'current'
     ORDER BY updated_at DESC, rowid DESC
     LIMIT 1
  `).get(workspaceId, projectId, sourceDomain, sourceId) as { index_text: string } | undefined
  return row?.index_text ?? ''
}

function semanticContribution(candidate: Candidate, semanticRanks: BaselineSemanticRanks): number {
  const sourceId = candidate.source_ref.source_id
  if (!sourceId) return 0
  if (candidate.type === 'memory' || candidate.type === 'decision') {
    return boundedRankScore(semanticRanks.memory.get(sourceId) ?? 0)
  }
  if (candidate.type === 'code_chunk' || candidate.type === 'file_chunk') {
    return boundedRankScore(semanticRanks.code.get(sourceId) ?? 0)
  }
  return 0
}

export function mergeSourceIds(...lists: string[][]): string[] {
  return Array.from(new Set(lists.flat().filter(Boolean)))
}

function totalScore(stageScores: Record<string, number>): number {
  return sumStageScores(stageScores)
}

export function loadGraphNames(workspaceId: string, terms: string[], db: Db): Map<string, string> {
  const filter = queryFilter(['name', 'entity_type', 'properties'], 'entity_id', terms.join(' '), [])
  if (!filter) return new Map()
  const rows = db.prepare(`
    SELECT entity_id, name
      FROM graph_entities
     WHERE workspace_id = ?
       AND (${filter.sql})
     ORDER BY ${filter.scoreSql} DESC, updated_at DESC, rowid DESC
     LIMIT ?
  `).all(workspaceId, ...filter.params, STAGE_CANDIDATE_LIMIT) as Array<{ entity_id: string; name: string }>

  const matches = new Map<string, string>()
  for (const row of rows) {
    if (lexicalScore(terms, row.name) > 0) matches.set(row.entity_id, row.name)
  }
  return matches
}

function graphContribution(candidate: Candidate, graphNames: Map<string, string>, terms: string[]): number {
  if (candidate.type === 'graph_entity' || candidate.type === 'graph_edge') {
    return lexicalScore(terms, candidate.search_text) * 0.5
  }
  for (const entityId of candidate.entity_ids) {
    const name = graphNames.get(entityId)
    if (name) return Math.max(0.2, lexicalScore(terms, name) * 0.5)
  }
  return 0
}

export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9_]+/i)
    .map(term => term.trim())
    .filter(term => term.length > 1)
}

export function matchingContextualSourceIds(input: SearchContextInput, sourceDomains: string[], db: Db): string[] {
  const terms = tokenize(input.query)
  if (!terms.length || !sourceDomains.length) return []
  const domainPlaceholders = sourceDomains.map(() => '?').join(', ')
  const termClauses = terms.map(() => 'lower(index_text) LIKE ? ESCAPE \'\\\'')
  const scoreSql = terms
    .map(term => `CASE WHEN lower(index_text) LIKE ${sqlString(`%${escapeLike(term)}%`)} ESCAPE '\\' THEN 1 ELSE 0 END`)
    .join(' + ')
  const rows = db.prepare(`
    SELECT source_id
      FROM contextual_index_records
     WHERE workspace_id = ?
       AND project_id = ?
       AND source_domain IN (${domainPlaceholders})
       AND status = 'current'
       AND (${termClauses.join(' OR ')})
     ORDER BY ${scoreSql} DESC, updated_at DESC, rowid DESC
     LIMIT ?
  `).all(
    input.workspace_id,
    input.project_id,
    ...sourceDomains,
    ...terms.map(term => `%${escapeLike(term)}%`),
    STAGE_CANDIDATE_LIMIT,
  ) as Array<{ source_id: string }>
  return rows.map(row => row.source_id)
}

export function queryFilter(columns: string[], idColumn: string, query: string, sourceIds: string[]): { sql: string; scoreSql: string; params: unknown[] } | null {
  const terms = tokenize(query)
  const clauses: string[] = []
  const scoreTerms: string[] = []
  const params: unknown[] = []
  for (const term of terms) {
    const pattern = `%${escapeLike(term)}%`
    for (const column of columns) {
      clauses.push(`lower(${column}) LIKE ? ESCAPE '\\'`)
      params.push(pattern)
      scoreTerms.push(`CASE WHEN lower(${column}) LIKE ${sqlString(pattern)} ESCAPE '\\' THEN 1 ELSE 0 END`)
    }
  }
  if (sourceIds.length) {
    clauses.push(`${idColumn} IN (${sourceIds.map(() => '?').join(', ')})`)
    params.push(...sourceIds)
    scoreTerms.push(`CASE WHEN ${idColumn} IN (${sourceIds.map(sqlString).join(', ')}) THEN 2 ELSE 0 END`)
  }
  if (!clauses.length) return null
  return { sql: clauses.join(' OR '), scoreSql: scoreTerms.join(' + '), params }
}

function escapeLike(value: string): string {
  return value.replace(/[\\\\%_]/g, char => `\\\\${char}`)
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export function lexicalScore(terms: string[], text: string): number {
  if (!terms.length || !text) return 0
  const haystack = text.toLowerCase()
  let matched = 0
  for (const term of terms) {
    if (haystack.includes(term)) matched += 1
  }
  return matched / terms.length
}

export function skippedStages(
  stageSummaries: Map<string, { candidate_count: number; limit: number }>,
  explicitSkipped: Array<{ stage: string; reason: string }> = [],
): Array<{ stage: string; reason: string }> {
  const skipped: Array<{ stage: string; reason: string }> = [...explicitSkipped]
  const skippedStageNames = new Set(skipped.map(stage => stage.stage))
  for (const stage of ['semantic', 'graph']) {
    if (skippedStageNames.has(stage)) continue
    const graphModeSatisfied = stage === 'graph' && ['graph_local', 'graph_global_summary', 'graph_drift']
      .some(graphStage => stageSummaries.has(graphStage))
    if (!stageSummaries.has(stage) && !graphModeSatisfied) {
      skipped.push({ stage, reason: stage === 'semantic' ? 'no current vector metadata available' : 'no matching graph evidence available' })
    }
  }
  return skipped
}

export function toResult(candidate: Candidate, score: number, rank: number, partial: boolean): TypedContextResult {
  return redactRoadmapArtifact({
    type: candidate.type,
    rank,
    score,
    title: candidate.title,
    snippet: candidate.snippet,
    source_ref: candidate.source_ref,
    provenance_class: candidate.provenance_class,
    freshness: candidate.freshness,
    stage_contributions: Object.entries(candidate.stage_scores)
      .filter(([, stageScore]) => stageScore > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([stage, stageScore], index) => ({ stage, rank: index + 1, score: stageScore })) satisfies StageContribution[],
    explanation_status: partial ? 'partial' : 'complete',
  })
}

export function buildTraceStages(
  stageSummaries: Map<string, { candidate_count: number; limit: number }>,
  skipped: Array<{ stage: string; reason: string }>,
  latencyMs: number,
  results: TypedContextResult[],
): QueryTraceStage[] {
  const stages: QueryTraceStage[] = []
  for (const stage of ['lexical', 'contextual_text', 'semantic', 'metadata_freshness', 'graph', 'graph_local', 'graph_global_summary', 'graph_drift']) {
    const skippedStage = skipped.find(item => item.stage === stage)
    const summary = stageSummaries.get(stage)
    const ranks = results
      .map(result => {
        const contribution = result.stage_contributions.find(item => item.stage === stage)
        if (!contribution) return null
        return {
          source_id: result.source_ref.graph_id ?? result.source_ref.source_id ?? result.source_ref.task_id ?? result.title,
          rank: result.rank,
          score: contribution.score,
        }
      })
      .filter((item): item is { source_id: string; rank: number; score: number } => Boolean(item))
    stages.push({
      name: stage,
      status: skippedStage ? 'skipped' : 'ok',
      candidate_count: summary?.candidate_count ?? 0,
      limit: summary?.limit ?? STAGE_CANDIDATE_LIMIT,
      latency_ms: latencyMs,
      ranks,
      score_summary: ranks.length
        ? {
            max: Math.max(...ranks.map(rank => rank.score)),
            min: Math.min(...ranks.map(rank => rank.score)),
          }
        : { max: 0, min: 0 },
      ...(skippedStage ? { reason: skippedStage.reason } : {}),
    })
  }
  return stages
}

export function safePathRef(value: unknown): Pick<ContextSourceReference, 'file_path' | 'path_fingerprint'> {
  const path = nullableString(value)
  if (!path) return {}
  if (path.startsWith('/')) return { path_fingerprint: pathFingerprintForRoadmap(path) }
  return { file_path: path }
}

export function freshnessFromScore(value: number): ContextFreshness {
  if (value >= 0.75) return 'current'
  if (value >= 0.25) return 'stale'
  return 'unknown'
}

export function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value !== 'string' || !value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export function nullableString(value: unknown): string | null {
  if (value === undefined || value === null) return null
  return String(value)
}

export function numberValue(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && Number.isFinite(Number(value))) return Number(value)
  return fallback
}

export function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && Number.isFinite(Number(value))) return Number(value)
  return undefined
}
