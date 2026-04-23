// v2a PR 2 Task 13 + RAG roadmap US3 — search_code action.
//
// Focused code retrieval remains backward-compatible with the legacy
// code_chunks shape while adding first-class code evidence signals:
// FTS, vec_chunks semantic search, path/symbol/package/module/dependency
// hints, changed-file hints, recency, line ranges, and index/vector status.

import type { Db } from 'fulcrum-agent-core'
import { getCodeEmbedder, getDb } from 'fulcrum-agent-core'
import { redactRoadmapArtifact } from '../setup/rag-redaction.js'
import { buildCodeSearchExplanation, type RagRecallExplanation } from './explain.js'
import { shouldPersistPlannerArtifacts } from './planner/contract.js'
import { startSearchPlannerExecution } from './planner/planner.js'
import { persistRagQueryTrace, redactQueryForTrace, type QueryTraceStage } from './query-trace.js'

type CodeParseStatus = 'parsed' | 'skipped' | 'failed'
type CodeVectorStatus = 'pending' | 'current' | 'stale' | 'failed' | 'skipped' | 'legacy'

export interface SearchCodeInput {
  workspace_id: string
  project_id?: string
  text?: string
  symbol?: string
  lang?: string
  path?: string
  package?: string
  module?: string
  dependency?: string
  changed_files?: string[]
  scope?: 'session' | 'project' | 'workspace' | 'global'
  min_score?: number
  limit?: number
  caller_run_id?: string
  caller_role?: string
  explain?: boolean
  persist?: boolean
}

export interface SearchCodeStageContribution {
  stage: string
  rank: number
  score: number
}

export interface SearchCodeRuntimeTruth {
  provider: string | null
  model: string | null
  actual_provider: string | null
  actual_model: string | null
  requested_device: string | null
  actual_device: string | null
  dimensions: number | null
}

export interface SearchCodeResultRow {
  chunk_id: string
  rel_path: string
  start_line: number
  end_line: number
  line_start: number
  line_end: number
  symbol_path: string | null
  language: string | null
  content: string
  score: number
  project_id: string
  file_id: string | null
  code_index_state: 'current' | 'legacy' | 'orphaned'
  parse_status: CodeParseStatus
  vector_status: CodeVectorStatus
  freshness: 'current' | 'stale' | 'failed' | 'unknown'
  indexed_at: string
  stage_scores: Record<string, number>
  stage_contributions: SearchCodeStageContribution[]
  runtime_truth: SearchCodeRuntimeTruth | null
  explanation?: RagRecallExplanation
}

export interface SearchCodeResponse {
  query_trace_id?: string
  results: SearchCodeResultRow[]
  reason?: 'no_match' | 'below_floor'
  skipped_stages?: Array<{ stage: string; reason: string }>
}

interface CandidateRow {
  chunk_id: string
  rel_path: string
  start_line: number
  end_line: number
  symbol_path: string | null
  language: string | null
  content: string
  project_id: string
  file_id: string | null
  indexed_at: string
  parse_status: CodeParseStatus
  file_status: string | null
  vector_status: CodeVectorStatus
  code_index_state: 'current' | 'legacy' | 'orphaned'
}

const RRF_K = 60
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const RANK_WEIGHTS: Record<string, number> = {
  fts: 1.0,
  code_vector: 1.35,
  symbol: 1.2,
  path: 1.1,
  package: 0.75,
  module: 0.7,
  dependency: 1.15,
  changed_file: 0.85,
  recency: 0.25,
}

function logRecallEvent(db: Db, chunk_id: string, query: string, rank: number, score: number, callerRunId?: string, callerRole?: string): void {
  try {
    db.prepare(`INSERT INTO memory_recall_events (memory_id, query, score, rank, caller_run_id, caller_role, source, created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(chunk_id, redactQueryForTrace(query), score, rank, callerRunId ?? null, callerRole ?? null, 'search_code', Date.now())
  } catch { /* aux table absent — non-fatal */ }
}

function rankScore(rank: number | null | undefined, weight = 1): number {
  return rank === null || rank === undefined ? 0 : weight / (RRF_K + rank)
}

function tokenize(value: string): string[] {
  return value.match(/[\p{L}\p{N}_]+/gu) ?? []
}

function ftsQuery(text: string): string | null {
  const safe = tokenize(text).map(t => `"${t.replace(/"/g, '""')}"`).join(' AND ')
  return safe || null
}

function indexedTime(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value
  const numeric = Number(value)
  if (Number.isFinite(numeric) && /^\d+$/.test(value)) return numeric
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '')
}

function hasPathMatch(relPath: string, queryPath: string): boolean {
  const rel = normalizePath(relPath).toLowerCase()
  const target = normalizePath(queryPath).toLowerCase()
  return rel === target || rel.endsWith(target) || rel.includes(target)
}

function hasPackageMatch(relPath: string, packageHint: string): boolean {
  const rel = normalizePath(relPath).toLowerCase()
  const hint = normalizePath(packageHint).toLowerCase()
  return rel.startsWith(`${hint}/`) || rel.includes(`/${hint}/`) || rel.includes(hint)
}

function hasModuleMatch(relPath: string, moduleHint: string): boolean {
  const rel = normalizePath(relPath).toLowerCase()
  const hint = moduleHint.toLowerCase()
  return rel.split('/').includes(hint) || rel.includes(`/${hint}/`) || rel.includes(hint)
}

function hasChangedFileMatch(relPath: string, changedFiles: string[]): boolean {
  return changedFiles.some(changed => hasPathMatch(relPath, changed))
}

function hasDependencyMatch(content: string, dependency: string): boolean {
  const escaped = dependency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const importPattern = new RegExp(`(?:from\\s+['"]${escaped}['"]|import\\s*\\(\\s*['"]${escaped}['"]\\s*\\)|require\\s*\\(\\s*['"]${escaped}['"]\\s*\\))`)
  return importPattern.test(content) || content.includes(dependency)
}

function baseWhere(input: SearchCodeInput): { where: string[]; params: unknown[] } {
  const where: string[] = ['c.workspace_id = ?']
  const params: unknown[] = [input.workspace_id]

  if (input.project_id) {
    where.push('c.project_id = ?')
    params.push(input.project_id)
  }
  if (input.lang) {
    where.push('c.language = ?')
    params.push(input.lang)
  }
  if (input.path) {
    where.push('c.file_path LIKE ?')
    params.push(`%${input.path}%`)
  }
  if (input.symbol) {
    where.push('c.symbol_path LIKE ?')
    params.push(`%${input.symbol}%`)
  }

  where.push(`(
    c.file_id IS NULL
    OR (f.file_id IS NOT NULL AND f.status = 'indexed' AND COALESCE(f.parse_status, 'parsed') = 'parsed')
  )`)

  return { where, params }
}

function stageRankFromRows(rows: Array<{ chunk_id: string }>): Map<string, number> {
  const ranks = new Map<string, number>()
  rows.forEach((row, index) => ranks.set(row.chunk_id, index + 1))
  return ranks
}

function ftsStage(db: Db, input: SearchCodeInput, where: string[], params: unknown[], fetchLimit: number): Map<string, number> {
  if (!input.text?.trim()) return new Map()
  const safe = ftsQuery(input.text)
  if (!safe) return new Map()
  try {
    const rows = db.prepare(`
      SELECT c.chunk_id, bm25(code_chunks_fts) AS bm25
        FROM code_chunks c
        JOIN code_chunks_fts ON c.rowid = code_chunks_fts.rowid
        LEFT JOIN code_files f
          ON f.file_id = c.file_id
         AND f.workspace_id = c.workspace_id
         AND f.project_id = c.project_id
       WHERE code_chunks_fts MATCH ?
         AND ${where.join(' AND ')}
       ORDER BY bm25 ASC
       LIMIT ?
    `).all(safe, ...params, fetchLimit) as Array<{ chunk_id: string }>
    return stageRankFromRows(rows)
  } catch {
    return new Map()
  }
}

async function vectorStage(
  db: Db,
  input: SearchCodeInput,
  where: string[],
  params: unknown[],
  fetchLimit: number,
  skipped: Array<{ stage: string; reason: string }>,
): Promise<Map<string, number>> {
  if (!input.text?.trim()) return new Map()
  const embedder = getCodeEmbedder()
  if (!embedder) {
    skipped.push({ stage: 'code_vector', reason: 'no code embedder registered' })
    return new Map()
  }
  try {
    const embedFn = ((embedder as { embedQuery?: (text: string) => Promise<Float32Array> }).embedQuery ?? embedder.embed).bind(embedder)
    const queryVec = await embedFn(input.text)
    const buf = Buffer.from(queryVec.buffer, queryVec.byteOffset, queryVec.byteLength)
	    const rows = db.prepare(`
	      SELECT v.chunk_id, row_number() OVER (ORDER BY v.distance) AS vecRank
	        FROM vec_chunks v
	        JOIN code_chunks c ON c.chunk_id = v.chunk_id
	        JOIN vector_metadata vm
	          ON vm.workspace_id = c.workspace_id
	         AND vm.source_domain = 'code_chunk'
	         AND vm.source_id = c.chunk_id
	         AND vm.vector_table = 'vec_chunks'
	         AND vm.status = 'current'
	        LEFT JOIN code_files f
	          ON f.file_id = c.file_id
	         AND f.workspace_id = c.workspace_id
	         AND f.project_id = c.project_id
	       WHERE v.embedding MATCH ?
	         AND k = ?
	         AND COALESCE(c.vector_status, 'legacy') = 'current'
	         AND ${where.join(' AND ')}
       ORDER BY v.distance
       LIMIT ?
    `).all(buf, fetchLimit, ...params, fetchLimit) as Array<{ chunk_id: string }>
    if (rows.length === 0) skipped.push({ stage: 'code_vector', reason: 'no current vec_chunks candidates' })
    return stageRankFromRows(rows)
  } catch (err) {
    skipped.push({ stage: 'code_vector', reason: `vec_chunks unavailable: ${redactRoadmapArtifact(err instanceof Error ? err.message : String(err))}` })
    return new Map()
  }
}

function hintStage(db: Db, input: SearchCodeInput, where: string[], params: unknown[], fetchLimit: number): Map<string, number> {
  const rows: Array<{ chunk_id: string }> = []
  const seen = new Set<string>()
  const addRows = (clause: string, hintParams: unknown[]) => {
    for (const row of hintRows(db, where, params, clause, hintParams, fetchLimit)) {
      if (seen.has(row.chunk_id)) continue
      seen.add(row.chunk_id)
      rows.push(row)
    }
  }
  if (input['package']) addRows('lower(c.file_path) LIKE ?', [`%${normalizePath(input['package']).toLowerCase()}%`])
  if (input.module) addRows('lower(c.file_path) LIKE ?', [`%${input.module.toLowerCase()}%`])
  if (input.dependency) addRows('c.content LIKE ?', [`%${input.dependency}%`])
  for (const changed of input.changed_files ?? []) addRows('c.file_path LIKE ?', [`%${normalizePath(changed)}%`])
  return stageRankFromRows(rows)
}

function hintRows(
  db: Db,
  where: string[],
  params: unknown[],
  clause: string,
  hintParams: unknown[],
  fetchLimit: number,
): Array<{ chunk_id: string }> {
  try {
    return db.prepare(`
      SELECT c.chunk_id
        FROM code_chunks c
        LEFT JOIN code_files f
          ON f.file_id = c.file_id
         AND f.workspace_id = c.workspace_id
         AND f.project_id = c.project_id
       WHERE ${where.join(' AND ')}
         AND (${clause})
       ORDER BY c.indexed_at DESC, c.rowid DESC
       LIMIT ?
    `).all(...params, ...hintParams, fetchLimit) as Array<{ chunk_id: string }>
  } catch {
    return []
  }
}

function matchingFailureStages(db: Db, input: SearchCodeInput): Array<{ stage: string; reason: string }> {
  const where = ['workspace_id = ?']
  const params: unknown[] = [input.workspace_id]
  if (input.project_id) {
    where.push('project_id = ?')
    params.push(input.project_id)
  }
  if (input.path) {
    where.push('rel_path LIKE ?')
    params.push(`%${input.path}%`)
  }
  const rows = db.prepare(`
    SELECT rel_path, status, parse_status, failure_reason
      FROM code_files
     WHERE ${where.join(' AND ')}
       AND (status != 'indexed' OR parse_status != 'parsed')
     ORDER BY last_error_at DESC, rel_path ASC
     LIMIT 5
  `).all(...params) as Array<{ rel_path: string; status: string; parse_status: string; failure_reason: string | null }>
  if (rows.length === 0) return []
  return [{
    stage: 'code_index',
    reason: rows.map(row => `${row.rel_path}:${row.parse_status}:${redactRoadmapArtifact(row.failure_reason ?? row.status)}`).join('; '),
  }]
}

function fetchCandidateRows(
  db: Db,
  input: SearchCodeInput,
  where: string[],
  params: unknown[],
  candidateIds: Set<string>,
  limit: number,
): CandidateRow[] {
  const finalWhere = [...where]
  const finalParams = [...params]
  if (candidateIds.size > 0) {
    finalWhere.push(`c.chunk_id IN (${[...candidateIds].map(() => '?').join(',')})`)
    finalParams.push(...candidateIds)
  }

  return db.prepare(`
    SELECT c.chunk_id,
           COALESCE(f.rel_path, c.file_path) AS rel_path,
           COALESCE(c.start_line, 1) AS start_line,
           COALESCE(c.end_line, COALESCE(c.start_line, 1)) AS end_line,
           c.symbol_path,
           COALESCE(c.language, f.language) AS language,
           c.content,
           c.project_id,
           c.file_id,
           c.indexed_at,
           COALESCE(c.parse_status, f.parse_status, 'parsed') AS parse_status,
           f.status AS file_status,
           COALESCE(c.vector_status, 'legacy') AS vector_status,
           CASE
             WHEN c.file_id IS NULL THEN 'legacy'
             WHEN f.file_id IS NULL THEN 'orphaned'
             ELSE 'current'
           END AS code_index_state
      FROM code_chunks c
      LEFT JOIN code_files f
        ON f.file_id = c.file_id
       AND f.workspace_id = c.workspace_id
       AND f.project_id = c.project_id
     WHERE ${finalWhere.join(' AND ')}
     ORDER BY c.indexed_at DESC, c.rowid DESC
     LIMIT ?
  `).all(...finalParams, limit) as CandidateRow[]
}

function rankByPredicate(rows: CandidateRow[], predicate: (row: CandidateRow) => boolean, score?: (row: CandidateRow) => number): Map<string, number> {
  const ranked = rows
    .filter(predicate)
    .map(row => ({ row, priority: score ? score(row) : 0 }))
    .sort((a, b) => a.priority - b.priority || a.row.rel_path.localeCompare(b.row.rel_path) || a.row.chunk_id.localeCompare(b.row.chunk_id))
  return stageRankFromRows(ranked.map(item => ({ chunk_id: item.row.chunk_id })))
}

function runtimeTruth(db: Db, chunkId: string): SearchCodeRuntimeTruth | null {
  const row = db.prepare(`
    SELECT provider, model, actual_provider, actual_model, requested_device, actual_device, dimensions
      FROM vector_metadata
     WHERE source_domain = 'code_chunk'
       AND source_id = ?
     ORDER BY embedded_at DESC, rowid DESC
     LIMIT 1
  `).get(chunkId) as SearchCodeRuntimeTruth | undefined
  return row ?? null
}

function freshness(row: CandidateRow): SearchCodeResultRow['freshness'] {
  if (row.parse_status === 'failed' || row.vector_status === 'failed') return 'failed'
  if (row.vector_status === 'stale') return 'stale'
  if (row.code_index_state === 'orphaned') return 'unknown'
  return 'current'
}

function stageContributions(stageScores: Record<string, number>, stageRanks: Record<string, number | null>): SearchCodeStageContribution[] {
  return Object.entries(stageScores)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([stage, score]) => ({ stage, rank: stageRanks[stage] ?? 0, score }))
}

function searchCodeQuery(input: SearchCodeInput): string {
  return input.text
    ?? input.symbol
    ?? input.path
    ?? input['package']
    ?? input.module
    ?? input.dependency
    ?? input.changed_files?.join(' ')
    ?? ''
}

function normalizedLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_LIMIT
  return Math.max(1, Math.min(Math.floor(value), MAX_LIMIT))
}

function rankDetails(ranks: Map<string, number>, rows: SearchCodeResultRow[]): Array<{ source_id: string; rank: number; score: number }> {
  const scores = new Map(rows.map(row => [row.chunk_id, row.score]))
  return [...ranks.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, 20)
    .map(([source_id, rank]) => ({ source_id, rank, score: scores.get(source_id) ?? 0 }))
}

function scoreSummary(rows: SearchCodeResultRow[], stage: string): Record<string, number> {
  const scores = rows.map(row => row.stage_scores[stage] ?? 0).filter(score => score > 0)
  if (scores.length === 0) return { max: 0, min: 0 }
  return { max: Math.max(...scores), min: Math.min(...scores) }
}

function stageStatus(count: number, skipped: Array<{ stage: string; reason: string }>, stage: string): QueryTraceStage['status'] {
  const skip = skipped.find(item => item.stage === stage)
  if (skip) return count > 0 ? 'degraded' : 'skipped'
  return count > 0 ? 'ok' : 'skipped'
}

function persistSearchCodeTrace(input: {
  request: SearchCodeInput
  workspace_id: string
  project_id: string
  fetchLimit: number
  ftsRanks: Map<string, number>
  vectorRanks: Map<string, number>
  hintRanks: Map<string, number>
  skipped: Array<{ stage: string; reason: string }>
  results: SearchCodeResultRow[]
  latency_ms: number
  reason?: string
  db: Db
}): string {
  const skippedReason = (stage: string): string | undefined => input.skipped.find(item => item.stage === stage)?.reason
  const stages: QueryTraceStage[] = [{
    name: 'fts',
    status: stageStatus(input.ftsRanks.size, input.skipped, 'fts'),
    candidate_count: input.ftsRanks.size,
    limit: input.fetchLimit,
    latency_ms: input.latency_ms,
    ranks: rankDetails(input.ftsRanks, input.results),
    score_summary: scoreSummary(input.results, 'fts'),
  }, {
    name: 'code_vector',
    status: stageStatus(input.vectorRanks.size, input.skipped, 'code_vector'),
    candidate_count: input.vectorRanks.size,
    limit: input.fetchLimit,
    latency_ms: input.latency_ms,
    reason: skippedReason('code_vector'),
    ranks: rankDetails(input.vectorRanks, input.results),
    score_summary: scoreSummary(input.results, 'code_vector'),
  }, {
    name: 'hints',
    status: input.hintRanks.size > 0 ? 'ok' : 'skipped',
    candidate_count: input.hintRanks.size,
    limit: input.fetchLimit,
    latency_ms: input.latency_ms,
    ranks: rankDetails(input.hintRanks, input.results),
    score_summary: { max: 0, min: 0 },
  }]
  for (const skipped of input.skipped.filter(item => item.stage !== 'code_vector')) {
    stages.push({
      name: skipped.stage,
      status: 'skipped',
      candidate_count: 0,
      limit: input.fetchLimit,
      latency_ms: 0,
      reason: skipped.reason,
    })
  }
  return persistRagQueryTrace({
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    query: searchCodeQuery(input.request),
    stages,
    fusion: {
      method: 'rrf',
      weights: RANK_WEIGHTS,
      input_candidates: new Set([...input.ftsRanks.keys(), ...input.vectorRanks.keys(), ...input.hintRanks.keys()]).size,
      output_candidates: input.results.length,
      reason: input.reason,
    },
    rerank: {
      status: 'skipped',
      reason: 'search_code uses deterministic weighted RRF',
    },
    runtime_truth: (input.results[0]?.runtime_truth
      ? { ...input.results[0].runtime_truth }
      : { requested: {}, actual: {}, fallback: null }) as Record<string, unknown>,
    freshness: input.results.reduce<Record<string, number>>((acc, result) => {
      acc[result.freshness] = (acc[result.freshness] ?? 0) + 1
      return acc
    }, {}),
    provenance: {
      source_refs: input.results.map(result => ({
        source_id: result.chunk_id,
        file_path: result.rel_path,
        line_start: result.line_start,
        line_end: result.line_end,
        symbol_path: result.symbol_path ?? undefined,
      })),
      provenance_classes: { code_backed: input.results.length },
    },
  }, input.db)
}

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
