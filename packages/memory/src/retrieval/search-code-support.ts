import type { Db } from 'fulcrum-agent-core'
import { getCodeEmbedder } from 'fulcrum-agent-core'
import { createHash } from 'node:crypto'
import { redactRoadmapArtifact } from '../setup/rag-redaction.js'
import { shouldPersistPlannerArtifacts } from './planner/contract.js'
import { persistRagQueryTrace, redactQueryForTrace, type QueryTraceStage } from './query-trace.js'
import type {
  SearchCodeInput,
  SearchCodeResultRow,
  SearchCodeRuntimeTruth,
  SearchCodeStageContribution,
} from './search-code-contract.js'

export type CodeParseStatus = 'parsed' | 'skipped' | 'failed'
export type CodeVectorStatus = 'pending' | 'current' | 'stale' | 'failed' | 'skipped' | 'legacy'

export interface CandidateRow {
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
const QUERY_EMBED_CACHE_TTL_MS = 10 * 60 * 1000
const QUERY_EMBED_CACHE_MAX = 256
export const DEFAULT_LIMIT = 20
export const MAX_LIMIT = 50
export const RANK_WEIGHTS: Record<string, number> = {
  fts: 1.0,
  code_vector: 1.35,
  fts_split: 1.05,
  exact_symbol: 4.0,
  exact_identifier: 3.5,
  split_symbol: 2.75,
  exact_path: 3.75,
  symbol: 1.2,
  path: 1.1,
  package: 0.75,
  module: 0.7,
  dependency: 1.15,
  changed_file: 0.85,
  recency: 0.25,
}

export type CodeQueryKind = 'identifier' | 'path_like' | 'natural_language' | 'mixed' | 'empty'

interface QueryEmbeddingCacheEntry {
  vector: Float32Array
  createdAt: number
}

const queryEmbeddingCache = new Map<string, QueryEmbeddingCacheEntry>()

export function logRecallEvent(db: Db, chunk_id: string, query: string, rank: number, score: number, callerRunId?: string, callerRole?: string): void {
  try {
    db.prepare(`INSERT INTO memory_recall_events (memory_id, query, score, rank, caller_run_id, caller_role, source, created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(chunk_id, redactQueryForTrace(query), score, rank, callerRunId ?? null, callerRole ?? null, 'search_code', Date.now())
  } catch { /* aux table absent — non-fatal */ }
}

export function rankScore(rank: number | null | undefined, weight = 1): number {
  return rank === null || rank === undefined ? 0 : weight / (RRF_K + rank)
}

function tokenize(value: string): string[] {
  return value.match(/[\p{L}\p{N}_]+/gu) ?? []
}

function splitIdentifierToken(token: string): string[] {
  return token
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .map(part => part.toLowerCase())
    .filter(part => part.length > 1)
}

export function classifyCodeQuery(text: string | undefined): CodeQueryKind {
  const query = text?.trim() ?? ''
  if (!query) return 'empty'
  const rawTokens = tokenize(query)
  const hasPath = /[/\\]|\.[A-Za-z0-9]{1,8}\b/.test(query)
  const hasIdentifier = rawTokens.some(token => /[_-]/.test(token) || /[a-z][A-Z]/.test(token) || /^[A-Z][A-Za-z0-9]*$/.test(token))
  if (hasPath && rawTokens.length <= 3) return 'path_like'
  if (rawTokens.length === 1 && hasIdentifier) return 'identifier'
  if (hasPath || hasIdentifier) return 'mixed'
  return 'natural_language'
}

export function codeQueryTerms(text: string): { exact: string[]; split: string[] } {
  const exact = tokenize(text)
  const split = new Set<string>()
  for (const token of exact) {
    for (const part of splitIdentifierToken(token)) split.add(part)
  }
  return { exact, split: [...split] }
}

function ftsQuery(text: string): string | null {
  const safe = tokenize(text).map(t => `"${t.replace(/"/g, '""')}"`).join(' AND ')
  return safe || null
}

function ftsSplitQuery(text: string): string | null {
  const terms = codeQueryTerms(text).split
  if (terms.length <= 1) return null
  return terms.map(t => `"${t.replace(/"/g, '""')}"`).join(' AND ')
}

function queryCacheKey(input: SearchCodeInput, provider: unknown): string {
  const identity = provider as Record<string, unknown>
  const providerName = String(identity['actualProvider'] ?? identity['actual_provider'] ?? identity['provider'] ?? identity['provider_name'] ?? 'unknown')
  const modelName = String(identity['actualModel'] ?? identity['actual_model'] ?? identity['model'] ?? identity['model_name'] ?? 'unknown')
  const device = String(identity['actualDevice'] ?? identity['actual_device'] ?? 'auto')
  const hash = createHash('sha256').update(input.text ?? '').digest('hex')
  return `code|${providerName}|${modelName}|${device}|${hash}`
}

async function embedQueryCached(input: SearchCodeInput, embedder: NonNullable<ReturnType<typeof getCodeEmbedder>>): Promise<Float32Array> {
  const key = queryCacheKey(input, embedder)
  const now = Date.now()
  const cached = queryEmbeddingCache.get(key)
  if (cached && now - cached.createdAt <= QUERY_EMBED_CACHE_TTL_MS) {
    queryEmbeddingCache.delete(key)
    queryEmbeddingCache.set(key, cached)
    return cached.vector
  }
  const embedFn = ((embedder as { embedQuery?: (text: string) => Promise<Float32Array> }).embedQuery ?? embedder.embed).bind(embedder)
  const vector = await embedFn(input.text ?? '')
  queryEmbeddingCache.set(key, { vector, createdAt: now })
  while (queryEmbeddingCache.size > QUERY_EMBED_CACHE_MAX) {
    const oldest = queryEmbeddingCache.keys().next().value as string | undefined
    if (!oldest) break
    queryEmbeddingCache.delete(oldest)
  }
  return vector
}

export function _clearSearchCodeQueryEmbeddingCacheForTest(): void {
  queryEmbeddingCache.clear()
}

export function indexedTime(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value
  const numeric = Number(value)
  if (Number.isFinite(numeric) && /^\d+$/.test(value)) return numeric
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '')
}

export function hasPathMatch(relPath: string, queryPath: string): boolean {
  const rel = normalizePath(relPath).toLowerCase()
  const target = normalizePath(queryPath).toLowerCase()
  return rel === target || rel.endsWith(target) || rel.includes(target)
}

export function hasPackageMatch(relPath: string, packageHint: string): boolean {
  const rel = normalizePath(relPath).toLowerCase()
  const hint = normalizePath(packageHint).toLowerCase()
  return rel.startsWith(`${hint}/`) || rel.includes(`/${hint}/`) || rel.includes(hint)
}

export function hasModuleMatch(relPath: string, moduleHint: string): boolean {
  const rel = normalizePath(relPath).toLowerCase()
  const hint = moduleHint.toLowerCase()
  return rel.split('/').includes(hint) || rel.includes(`/${hint}/`) || rel.includes(hint)
}

export function hasChangedFileMatch(relPath: string, changedFiles: string[]): boolean {
  return changedFiles.some(changed => hasPathMatch(relPath, changed))
}

export function hasDependencyMatch(content: string, dependency: string): boolean {
  const escaped = dependency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const importPattern = new RegExp(`(?:from\\s+['"]${escaped}['"]|import\\s*\\(\\s*['"]${escaped}['"]\\s*\\)|require\\s*\\(\\s*['"]${escaped}['"]\\s*\\))`)
  return importPattern.test(content) || content.includes(dependency)
}

export function baseWhere(input: SearchCodeInput): { where: string[]; params: unknown[] } {
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

export function stageRankFromRows(rows: Array<{ chunk_id: string }>): Map<string, number> {
  const ranks = new Map<string, number>()
  rows.forEach((row, index) => ranks.set(row.chunk_id, index + 1))
  return ranks
}

export function ftsStage(db: Db, input: SearchCodeInput, where: string[], params: unknown[], fetchLimit: number): Map<string, number> {
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

export function ftsSplitStage(db: Db, input: SearchCodeInput, where: string[], params: unknown[], fetchLimit: number): Map<string, number> {
  if (!input.text?.trim()) return new Map()
  const safe = ftsSplitQuery(input.text)
  if (!safe || safe === ftsQuery(input.text)) return new Map()
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

export async function vectorStage(
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
    const queryVec = await embedQueryCached(input, embedder)
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

export function exactSymbolRank(rows: CandidateRow[], query: string | undefined): Map<string, number> {
  if (!query?.trim()) return new Map()
  const needle = query.trim()
  const lowered = needle.toLowerCase()
  return rankByPredicate(rows, row => {
    const symbol = row.symbol_path ?? ''
    const base = symbol.split(/[.:/]/).pop() ?? symbol
    return symbol === needle
      || symbol.endsWith(`.${needle}`)
      || symbol.endsWith(`:${needle}`)
      || base.toLowerCase() === lowered
  }, row => {
    const symbol = row.symbol_path ?? ''
    if (symbol === needle) return 0
    if (symbol.endsWith(`.${needle}`) || symbol.endsWith(`:${needle}`)) return 1
    return 2
  })
}

export function exactIdentifierRank(rows: CandidateRow[], query: string | undefined): Map<string, number> {
  if (!query?.trim()) return new Map()
  const terms = codeQueryTerms(query).exact.map(term => term.toLowerCase())
  if (terms.length === 0) return new Map()
  return rankByPredicate(rows, row => {
    const haystack = `${row.symbol_path ?? ''} ${row.content}`.toLowerCase()
    return terms.some(term => new RegExp(`(^|[^\\p{L}\\p{N}_])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}_])`, 'u').test(haystack))
  })
}

export function splitSymbolRank(rows: CandidateRow[], query: string | undefined): Map<string, number> {
  if (!query?.trim()) return new Map()
  const terms = new Set(codeQueryTerms(query).split.filter(term => term.length > 2 && term !== 'for'))
  if (terms.size === 0) return new Map()
  return rankByPredicate(rows, row => {
    const symbolTerms = new Set(codeQueryTerms(row.symbol_path ?? '').split)
    if (symbolTerms.size === 0) return false
    for (const term of terms) if (!symbolTerms.has(term)) return false
    return true
  }, row => normalizePath(row.rel_path).length)
}

export function hintStage(db: Db, input: SearchCodeInput, where: string[], params: unknown[], fetchLimit: number): Map<string, number> {
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

export function symbolSplitStage(db: Db, input: SearchCodeInput, where: string[], params: unknown[], fetchLimit: number): Map<string, number> {
  if (!input.text?.trim()) return new Map()
  const terms = codeQueryTerms(input.text).split.filter(term => term.length > 2 && term !== 'for')
  if (terms.length === 0) return new Map()
  const clauses = terms.map(() => 'lower(c.symbol_path) LIKE ?')
  const termParams = terms.map(term => `%${term.toLowerCase()}%`)
  try {
    const rows = db.prepare(`
      SELECT c.chunk_id
        FROM code_chunks c
        LEFT JOIN code_files f
          ON f.file_id = c.file_id
         AND f.workspace_id = c.workspace_id
         AND f.project_id = c.project_id
       WHERE ${where.join(' AND ')}
         AND c.symbol_path IS NOT NULL
         AND ${clauses.join(' AND ')}
       ORDER BY length(c.symbol_path) ASC, c.indexed_at DESC, c.rowid DESC
       LIMIT ?
    `).all(...params, ...termParams, fetchLimit) as Array<{ chunk_id: string }>
    return stageRankFromRows(rows)
  } catch {
    return new Map()
  }
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

export function matchingFailureStages(db: Db, input: SearchCodeInput): Array<{ stage: string; reason: string }> {
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

export function fetchCandidateRows(
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

export function rankByPredicate(rows: CandidateRow[], predicate: (row: CandidateRow) => boolean, score?: (row: CandidateRow) => number): Map<string, number> {
  const ranked = rows
    .filter(predicate)
    .map(row => ({ row, priority: score ? score(row) : 0 }))
    .sort((a, b) => a.priority - b.priority || a.row.rel_path.localeCompare(b.row.rel_path) || a.row.chunk_id.localeCompare(b.row.chunk_id))
  return stageRankFromRows(ranked.map(item => ({ chunk_id: item.row.chunk_id })))
}

export function runtimeTruth(db: Db, chunkId: string): SearchCodeRuntimeTruth | null {
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

export function freshness(row: CandidateRow): SearchCodeResultRow['freshness'] {
  if (row.parse_status === 'failed' || row.vector_status === 'failed') return 'failed'
  if (row.vector_status === 'stale') return 'stale'
  if (row.code_index_state === 'orphaned') return 'unknown'
  return 'current'
}

export function stageContributions(stageScores: Record<string, number>, stageRanks: Record<string, number | null>): SearchCodeStageContribution[] {
  return Object.entries(stageScores)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([stage, score]) => ({ stage, rank: stageRanks[stage] ?? 0, score }))
}

export function searchCodeQuery(input: SearchCodeInput): string {
  return input.text
    ?? input.symbol
    ?? input.path
    ?? input['package']
    ?? input.module
    ?? input.dependency
    ?? input.changed_files?.join(' ')
    ?? ''
}

export function normalizedLimit(value: number | undefined): number {
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

export function persistSearchCodeTrace(input: {
  request: SearchCodeInput
  workspace_id: string
  project_id: string
  fetchLimit: number
  ftsRanks: Map<string, number>
  ftsSplitRanks?: Map<string, number>
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
    name: 'fts_split',
    status: input.ftsSplitRanks && input.ftsSplitRanks.size > 0 ? 'ok' : 'skipped',
    candidate_count: input.ftsSplitRanks?.size ?? 0,
    limit: input.fetchLimit,
    latency_ms: input.latency_ms,
    ranks: rankDetails(input.ftsSplitRanks ?? new Map(), input.results),
    score_summary: scoreSummary(input.results, 'fts_split'),
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
      input_candidates: new Set([...input.ftsRanks.keys(), ...(input.ftsSplitRanks?.keys() ?? []), ...input.vectorRanks.keys(), ...input.hintRanks.keys()]).size,
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
