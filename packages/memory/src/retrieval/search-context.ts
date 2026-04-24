import { getDb } from 'fulcrum-agent-core'
import type { Db } from 'fulcrum-agent-core'
import { readGraphEvidenceUnits, type GraphEvidenceUnit } from '../graph/evidence.js'
import { redactRagDetails } from '../setup/rag-redaction.js'
import { packContext, type ContextPack } from './context-pack.js'
import { loadBaselineSemanticRanks, type BaselineSemanticRanks } from './planner/baseline-lane.js'
import { boundedRankScore, rankCandidates, sumStageScores } from './planner/fusion.js'
import { startSearchPlannerExecution } from './planner/planner.js'
import { persistSearchContextObservability } from './planner/observability.js'
import type {
  SearchContextInput,
  SearchContextResponse,
} from './search-context-contract.js'
import type {
  ContextFreshness,
  ContextSourceReference,
  StageContribution,
  TypedContextResult,
  TypedContextResultType,
} from './context-types.js'
import {
  type GraphContributionDetail,
  type QueryTraceStage,
} from './query-trace.js'
import {
  type Candidate,
  DEFAULT_LIMIT,
  GRAPH_MODES,
  type SearchGraphMode,
  STAGE_CANDIDATE_LIMIT,
  buildTraceStages,
  currentContextualText,
  expandGraphCandidates,
  finalizeGraphContributions,
  freshnessFromScore,
  loadGraphNames,
  lexicalScore,
  matchingContextualSourceIds,
  mergeSourceIds,
  nullableString,
  numberOrUndefined,
  numberValue,
  parseStringArray,
  queryFilter,
  safePathRef,
  scoreCandidates,
  skippedStages,
  summarizeStages,
  toResult,
  tokenize,
  unitToCandidate,
} from './search-context-support.js'

export type {
  ContextFreshness,
  ContextSourceReference,
  StageContribution,
  TypedContextResult,
  TypedContextResultType,
} from './context-types.js'
export type {
  SearchContextInput,
  SearchContextResponse,
} from './search-context-contract.js'

class SearchContextInputError extends Error {
  code = 'invalid_graph_mode'
  retryable = false

  constructor(value: unknown) {
    super(`invalid graph_mode: ${String(value)}`)
    this.name = 'SearchContextInputError'
  }
}

function normalizeGraphMode(value: SearchContextInput['graph_mode'] | undefined): SearchGraphMode {
  if (value === undefined) return 'local'
  if ((GRAPH_MODES as readonly string[]).includes(value)) return value
  throw new SearchContextInputError(value)
}

export async function searchContext(input: SearchContextInput, db: Db = getDb()): Promise<SearchContextResponse> {
  const planner = startSearchPlannerExecution(input)
  const started = Date.now()
  const limit = Math.max(1, Math.min(planner.limit ?? DEFAULT_LIMIT, 50))
  const terms = tokenize(planner.query)
  const includeGraph = planner.include_graph !== false
  const graphMode = normalizeGraphMode(planner.graph_mode)
  const semanticRanks = await loadBaselineSemanticRanks({
    query: planner.query,
    workspace_id: planner.workspace_id,
    project_id: planner.project_id,
    limit: STAGE_CANDIDATE_LIMIT,
  }, db)
  const graphUnits = includeGraph ? readGraphEvidenceUnits({
    workspace_id: planner.workspace_id,
    project_id: planner.project_id,
  }, db).filter(unit => unit.freshness !== 'failed') : []
  const graphNames = includeGraph ? loadGraphNames(planner.workspace_id, terms, db) : new Map<string, string>()
  const candidates = [
    ...memoryCandidates(planner, db, Array.from(semanticRanks.memory.keys())),
    ...codeCandidates(planner, db, Array.from(semanticRanks.code.keys())),
    ...taskCandidates(planner, db),
    ...(includeGraph ? graphEvidenceCandidates(planner, graphUnits) : []),
  ]

  scoreCandidates(candidates, terms, graphNames, semanticRanks, includeGraph)
  const graphExpansion = includeGraph
    ? expandGraphCandidates({ input: planner, graphMode, graphUnits, candidates, terms })
    : { candidates: [], skipped_stages: [{ stage: 'graph', reason: 'graph expansion disabled' }], graph_contributions: [] }
  candidates.push(...graphExpansion.candidates)
  scoreCandidates(graphExpansion.candidates, terms, graphNames, semanticRanks, includeGraph)

  const stageSummaries = summarizeStages(candidates)
  const skipped_stages = skippedStages(stageSummaries, [...semanticRanks.skipped_stages, ...graphExpansion.skipped_stages])
  const ranked = rankCandidates(candidates, {
    limit,
    score: candidate => sumStageScores(candidate.stage_scores),
    tieBreaker: candidate => candidate.title,
  })

  const results = ranked.map((item, index) => toResult(item.candidate, item.score, index + 1, skipped_stages.length > 0))
  const stages = buildTraceStages(stageSummaries, skipped_stages, Date.now() - started, results)
  const query_trace_id = planner.query_trace_id
  let graph_contributions = finalizeGraphContributions(graphExpansion.graph_contributions, results, undefined)
  let context_pack: ContextPack | undefined
  if (planner.context_budget_tokens !== undefined) {
    const packed = packContext(results, planner.context_budget_tokens)
    context_pack = { ...packed, query_trace_id }
    graph_contributions = finalizeGraphContributions(graph_contributions, results, context_pack)
  }

  persistSearchContextObservability({
    persist: planner.persist,
    query_trace_id,
    workspace_id: planner.workspace_id,
    project_id: planner.project_id,
    query: planner.query,
    stages,
    results,
    fusion: {
      method: 'weighted_sum',
      input_candidates: candidates.length,
      output_candidates: results.length,
      weights: {
        lexical: 1,
        contextual_text: 1.4,
        semantic: 1.2,
        metadata_freshness: 1,
        graph: 1,
        graph_local: 0.8,
        graph_global_summary: 0.9,
        graph_drift: 1,
      },
      candidate_limit: STAGE_CANDIDATE_LIMIT,
      result_limit: limit,
      graph_mode: graphMode,
    },
    rerank: {
      status: 'skipped',
      reason: 'search_context uses deterministic weighted fusion',
    },
    runtime_truth: {
      model_calls: semanticRanks.model_calls,
      retrieval: semanticRanks.model_calls > 0 ? 'sqlite-lexical-contextual-semantic' : 'sqlite-lexical-contextual',
    },
    freshness: results.reduce<Record<string, number>>((acc, result) => {
      acc[result.freshness] = (acc[result.freshness] ?? 0) + 1
      return acc
    }, {}),
    provenance: {
      source_refs: results.map(result => result.source_ref),
      provenance_classes: results.reduce<Record<string, number>>((acc, result) => {
        acc[result.provenance_class] = (acc[result.provenance_class] ?? 0) + 1
        return acc
      }, {}),
    },
    graph_contributions,
    context_pack,
  }, db)

  return {
    query_trace_id,
    results,
    skipped_stages,
    graph_contributions,
    ...(context_pack ? { context_pack } : {}),
  }
}

function memoryCandidates(input: SearchContextInput, db: Db, semanticIds: string[] = []): Candidate[] {
  const sourceIds = mergeSourceIds(matchingContextualSourceIds(input, ['memory', 'decision'], db), semanticIds)
  const filter = queryFilter(['kind', 'title', 'summary', 'content', 'file_path', 'symbol_path'], 'memory_id', input.query, sourceIds)
  if (!filter) return []
  const rows = db.prepare(`
    SELECT memory_id, kind, title, summary, content, content_hash, freshness,
           entities, provenance, file_path, symbol_path, updated_at
      FROM memories
     WHERE workspace_id = ?
       AND (project_id = ? OR project_id IS NULL)
       AND (${filter.sql})
     ORDER BY ${filter.scoreSql} DESC, updated_at DESC, rowid DESC
     LIMIT ?
  `).all(input.workspace_id, input.project_id, ...filter.params, STAGE_CANDIDATE_LIMIT) as Array<Record<string, unknown>>

  return rows.map(row => {
    const sourceId = String(row['memory_id'])
    const contextual = currentContextualText(input.workspace_id, input.project_id, memoryDomain(row), sourceId, db)
    const source_ref: ContextSourceReference = {
      source_id: sourceId,
      ...safePathRef(row['file_path']),
      symbol_path: nullableString(row['symbol_path']) ?? undefined,
    }
    return {
      type: row['kind'] === 'decision' ? 'decision' : 'memory',
      title: nullableString(row['title']) || sourceId,
      snippet: nullableString(row['content']) || nullableString(row['summary']) || '',
      source_ref,
      provenance_class: 'curated_backed',
      freshness: freshnessFromScore(numberValue(row['freshness'], 1)),
      freshness_score: Math.max(0, numberValue(row['freshness'], 1)) * 0.1,
      search_text: [
        row['kind'],
        row['title'],
        row['summary'],
        row['content'],
      ].map(value => nullableString(value) ?? '').join(' '),
      contextual_text: contextual,
      entity_ids: parseStringArray(row['entities']),
      stage_scores: {},
    }
  })
}

function codeCandidates(input: SearchContextInput, db: Db, semanticIds: string[] = []): Candidate[] {
  const sourceIds = mergeSourceIds(matchingContextualSourceIds(input, ['code_chunk', 'file_chunk'], db), semanticIds)
  const filter = queryFilter(['file_path', 'symbol_path', 'content'], 'chunk_id', input.query, sourceIds)
  if (!filter) return []
  const rows = db.prepare(`
    SELECT chunk_id, file_path, source_type, content, content_hash,
           start_line, end_line, symbol_path, indexed_at
      FROM code_chunks
     WHERE workspace_id = ?
       AND project_id = ?
       AND (${filter.sql})
     ORDER BY ${filter.scoreSql} DESC, indexed_at DESC, rowid DESC
     LIMIT ?
  `).all(input.workspace_id, input.project_id, ...filter.params, STAGE_CANDIDATE_LIMIT) as Array<Record<string, unknown>>

  return rows.map(row => {
    const sourceId = String(row['chunk_id'])
    const type = row['source_type'] === 'prose' ? 'file_chunk' : 'code_chunk'
    return {
      type,
      title: nullableString(row['symbol_path']) || nullableString(row['file_path']) || sourceId,
      snippet: nullableString(row['content']) ?? '',
      source_ref: {
        source_id: sourceId,
        ...safePathRef(row['file_path']),
        line_start: numberOrUndefined(row['start_line']),
        line_end: numberOrUndefined(row['end_line']),
        symbol_path: nullableString(row['symbol_path']) ?? undefined,
      },
      provenance_class: 'code_backed',
      freshness: 'current',
      freshness_score: 0.1,
      search_text: [row['file_path'], row['symbol_path'], row['content']].map(value => nullableString(value) ?? '').join(' '),
      contextual_text: currentContextualText(input.workspace_id, input.project_id, type, sourceId, db),
      entity_ids: [],
      stage_scores: {},
    }
  })
}

function taskCandidates(input: SearchContextInput, db: Db): Candidate[] {
  const contextIds = matchingContextualSourceIds(input, ['task'], db)
  const filter = queryFilter(['display_id', 'title', 'description', 'status', 'priority'], 'task_id', input.query, contextIds)
  if (!filter) return []
  const rows = db.prepare(`
    SELECT task_id, display_id, title, description, status, priority, updated_at
      FROM tasks
     WHERE workspace_id = ?
       AND project_id = ?
       AND (${filter.sql})
     ORDER BY ${filter.scoreSql} DESC, updated_at DESC, rowid DESC
     LIMIT ?
  `).all(input.workspace_id, input.project_id, ...filter.params, STAGE_CANDIDATE_LIMIT) as Array<Record<string, unknown>>

  return rows.map(row => {
    const taskId = String(row['task_id'])
    return {
      type: 'task',
      title: nullableString(row['title']) || taskId,
      snippet: nullableString(row['description']) || nullableString(row['status']) || '',
      source_ref: { task_id: taskId, source_id: taskId },
      provenance_class: 'task_backed',
      freshness: 'current',
      freshness_score: 0.1,
      search_text: [row['display_id'], row['title'], row['description'], row['status'], row['priority']].map(value => nullableString(value) ?? '').join(' '),
      contextual_text: currentContextualText(input.workspace_id, input.project_id, 'task', taskId, db),
      entity_ids: [],
      stage_scores: {},
    }
  })
}

function graphEvidenceCandidates(input: SearchContextInput, units: GraphEvidenceUnit[]): Candidate[] {
  const terms = tokenize(input.query)
  return units
    .map(unit => unitToCandidate(unit))
    .filter(candidate => lexicalScore(terms, candidate.search_text) > 0)
    .slice(0, STAGE_CANDIDATE_LIMIT)
}

function memoryDomain(row: Record<string, unknown>): string {
  return row['kind'] === 'decision' ? 'decision' : 'memory'
}
