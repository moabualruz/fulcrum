// v2a PR 2 Task 13 + RAG roadmap US3 — search_code action.
//
// Focused code retrieval remains backward-compatible with the legacy
// code_chunks shape while adding first-class code evidence signals:
// FTS, vec_chunks semantic search, path/symbol/package/module/dependency
// hints, changed-file hints, recency, line ranges, and index/vector status.

import type { Db } from 'fulcrum-agent-core'
import { getDb } from 'fulcrum-agent-core'
import { redactRoadmapArtifact } from '../setup/rag-redaction.js'
import { buildCodeSearchExplanation } from './explain.js'
import { shouldPersistPlannerArtifacts } from './planner/contract.js'
import { startSearchPlannerExecution } from './planner/planner.js'
import type {
  SearchCodeInput,
  SearchCodeResponse,
  SearchCodeResultRow,
  SearchCodeRuntimeTruth,
  SearchCodeStageContribution,
} from './search-code-contract.js'
import {
  type CandidateRow,
  type CodeParseStatus,
  type CodeVectorStatus,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  RANK_WEIGHTS,
  baseWhere,
  fetchCandidateRows,
  freshness,
  ftsStage,
  hasChangedFileMatch,
  hasDependencyMatch,
  hasModuleMatch,
  hasPackageMatch,
  hasPathMatch,
  hintStage,
  indexedTime,
  logRecallEvent,
  matchingFailureStages,
  normalizedLimit,
  normalizePath,
  persistSearchCodeTrace,
  rankScore,
  rankByPredicate,
  runtimeTruth,
  searchCodeQuery,
  stageRankFromRows,
  stageContributions,
  vectorStage,
} from './search-code-support.js'

export type {
  SearchCodeInput,
  SearchCodeResponse,
  SearchCodeResultRow,
  SearchCodeRuntimeTruth,
  SearchCodeStageContribution,
} from './search-code-contract.js'


export async function searchCode(input: SearchCodeInput, db: Db = getDb()): Promise<SearchCodeResponse> {
  const planner = startSearchPlannerExecution(input)
  const started = Date.now()
  const limit = normalizedLimit(planner.limit)
  const minScore = planner.min_score ?? 0
  const fetchLimit = Math.max(limit * 6, 50)
  const skipped: Array<{ stage: string; reason: string }> = []
  const { where, params } = baseWhere(planner)

  const ftsRanks = ftsStage(db, planner, where, params, fetchLimit)
  const vectorRanks = await vectorStage(db, planner, where, params, fetchLimit, skipped)
  const hintRanks = hintStage(db, planner, where, params, fetchLimit)
  const candidateIds = new Set<string>([...ftsRanks.keys(), ...vectorRanks.keys(), ...hintRanks.keys()])
  const hasHints = Boolean(planner.path || planner.symbol || planner.lang || planner['package'] || planner.module || planner.dependency || planner.changed_files?.length)
  if (planner.text?.trim() && candidateIds.size === 0 && !hasHints) {
    const response: SearchCodeResponse = { results: [], reason: 'no_match' }
    const failures = matchingFailureStages(db, planner)
    const allSkipped = [...skipped, ...failures]
    if (allSkipped.length > 0) response.skipped_stages = allSkipped
    if (planner.explain && planner.project_id && shouldPersistPlannerArtifacts(planner)) {
      response.query_trace_id = persistSearchCodeTrace({
        request: planner,
        workspace_id: planner.workspace_id,
        project_id: planner.project_id,
        fetchLimit,
        ftsRanks,
        vectorRanks,
        hintRanks,
        skipped: allSkipped,
        results: [],
        latency_ms: Date.now() - started,
        reason: 'no_match',
        db,
      })
    }
    return response
  }

  let rows: CandidateRow[]
  try {
    rows = fetchCandidateRows(db, planner, where, params, candidateIds, Math.max(fetchLimit, candidateIds.size))
  } catch {
    return { results: [], reason: 'no_match' }
  }

  if (rows.length === 0) {
    const response: SearchCodeResponse = { results: [], reason: 'no_match' }
    const failures = matchingFailureStages(db, planner)
    const allSkipped = [...skipped, ...failures]
    if (allSkipped.length > 0) response.skipped_stages = allSkipped
    if (planner.explain && planner.project_id && shouldPersistPlannerArtifacts(planner)) {
      response.query_trace_id = persistSearchCodeTrace({
        request: planner,
        workspace_id: planner.workspace_id,
        project_id: planner.project_id,
        fetchLimit,
        ftsRanks,
        vectorRanks,
        hintRanks,
        skipped: allSkipped,
        results: [],
        latency_ms: Date.now() - started,
        reason: 'no_match',
        db,
      })
    }
    return response
  }

  const symbolRanks = planner.symbol
    ? rankByPredicate(rows, row => Boolean(row.symbol_path?.includes(planner.symbol!)), row => {
      const symbol = row.symbol_path ?? ''
      if (symbol === planner.symbol) return 0
      if (symbol.endsWith(`.${planner.symbol}`) || symbol.endsWith(`:${planner.symbol}`)) return 1
      return 2
    })
    : new Map<string, number>()
  const pathRanks = planner.path
    ? rankByPredicate(rows, row => hasPathMatch(row.rel_path, planner.path!), row => normalizePath(row.rel_path).length)
    : new Map<string, number>()
  const packageRanks = planner['package']
    ? rankByPredicate(rows, row => hasPackageMatch(row.rel_path, planner['package']!), row => normalizePath(row.rel_path).indexOf(normalizePath(planner['package']!)))
    : new Map<string, number>()
  const moduleRanks = planner.module
    ? rankByPredicate(rows, row => hasModuleMatch(row.rel_path, planner.module!), row => normalizePath(row.rel_path).indexOf(planner.module!))
    : new Map<string, number>()
  const dependencyRanks = planner.dependency
    ? rankByPredicate(rows, row => hasDependencyMatch(row.content, planner.dependency!))
    : new Map<string, number>()
  const changedFileRanks = planner.changed_files?.length
    ? rankByPredicate(rows, row => hasChangedFileMatch(row.rel_path, planner.changed_files!))
    : new Map<string, number>()
  const recencyRanks = stageRankFromRows([...rows]
    .sort((a, b) => indexedTime(b.indexed_at) - indexedTime(a.indexed_at) || a.chunk_id.localeCompare(b.chunk_id))
    .map(row => ({ chunk_id: row.chunk_id })))

  const results = rows
    .map(row => {
      const ranks: Record<string, number | null> = {
        fts: ftsRanks.get(row.chunk_id) ?? null,
        code_vector: vectorRanks.get(row.chunk_id) ?? null,
        symbol: symbolRanks.get(row.chunk_id) ?? null,
        path: pathRanks.get(row.chunk_id) ?? null,
        package: packageRanks.get(row.chunk_id) ?? null,
        module: moduleRanks.get(row.chunk_id) ?? null,
        dependency: dependencyRanks.get(row.chunk_id) ?? null,
        changed_file: changedFileRanks.get(row.chunk_id) ?? null,
        recency: recencyRanks.get(row.chunk_id) ?? null,
      }
      const stage_scores: Record<string, number> = Object.fromEntries(
        Object.entries(ranks).map(([stage, rank]) => [stage, rankScore(rank, RANK_WEIGHTS[stage] ?? 1)]),
      )
      const score = Object.values(stage_scores).reduce((sum, value) => sum + value, 0)
      const result: SearchCodeResultRow = {
        chunk_id: row.chunk_id,
        rel_path: row.rel_path,
        start_line: row.start_line,
        end_line: row.end_line,
        line_start: row.start_line,
        line_end: row.end_line,
        symbol_path: row.symbol_path,
        language: row.language,
        content: row.content,
        score,
        project_id: row.project_id,
        file_id: row.file_id,
        code_index_state: row.code_index_state,
        parse_status: row.parse_status,
        vector_status: row.vector_status,
        freshness: freshness(row),
        indexed_at: row.indexed_at,
        stage_scores,
        stage_contributions: stageContributions(stage_scores, ranks),
        runtime_truth: runtimeTruth(db, row.chunk_id),
      }
      if (planner.explain) {
        const explanationScores = Object.fromEntries(
          Object.entries(ranks).map(([stage, rank]) => [stage, rank === null ? null : stage_scores[stage] ?? null]),
        ) as Record<string, number | null>
        result.explanation = buildCodeSearchExplanation({
          chunk_id: row.chunk_id,
          rel_path: row.rel_path,
          start_line: row.start_line,
          end_line: row.end_line,
          score,
          file_id: row.file_id,
          code_index_state: row.code_index_state,
          stage_ranks: ranks,
          stage_scores: { ...explanationScores, fused: score },
        })
      }
      return result
    })
    .sort((a, b) => b.score - a.score || indexedTime(b.indexed_at) - indexedTime(a.indexed_at) || a.rel_path.localeCompare(b.rel_path))
    .slice(0, limit)

  const filtered = minScore > 0 ? results.filter(r => r.score >= minScore) : results
  if (filtered.length === 0) {
    const response: SearchCodeResponse = { results: [], reason: 'below_floor' }
    const allSkipped = [...skipped, ...matchingFailureStages(db, planner)]
    if (allSkipped.length > 0) response.skipped_stages = allSkipped
    if (planner.explain && planner.project_id && shouldPersistPlannerArtifacts(planner)) {
      response.query_trace_id = persistSearchCodeTrace({
        request: planner,
        workspace_id: planner.workspace_id,
        project_id: planner.project_id,
        fetchLimit,
        ftsRanks,
        vectorRanks,
        hintRanks,
        skipped: allSkipped,
        results: [],
        latency_ms: Date.now() - started,
        reason: 'below_floor',
        db,
      })
    }
    return response
  }

  if (planner.persist) {
    filtered.forEach((r, idx) => {
      logRecallEvent(db, r.chunk_id, searchCodeQuery(planner), idx + 1, r.score, planner.caller_run_id, planner.caller_role)
    })
  }

  const response: SearchCodeResponse = { results: filtered }
  const allSkipped = [...skipped, ...matchingFailureStages(db, planner)]
  if (allSkipped.length > 0) response.skipped_stages = allSkipped
  if (planner.explain && shouldPersistPlannerArtifacts(planner)) {
    response.query_trace_id = persistSearchCodeTrace({
      request: planner,
      workspace_id: planner.workspace_id,
      project_id: planner.project_id ?? filtered[0]?.project_id ?? '',
      fetchLimit,
      ftsRanks,
      vectorRanks,
      hintRanks,
      skipped: allSkipped,
      results: filtered,
      latency_ms: Date.now() - started,
      db,
    })
  }
  return response
}
