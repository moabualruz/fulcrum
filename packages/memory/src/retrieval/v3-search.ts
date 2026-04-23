// packages/memory/src/retrieval/v3-search.ts
//
// Memory v3 PR 5 unit 5.1 — new retrieval pipeline.
//
// Extends the staged search model with:
//   * confidence filter (default floor 0.3 — plan §Retrieval)
//   * supersession filter (default: skip memories WHERE superseded_by IS NOT NULL)
//   * graph traversal stage (1-2 hops from query-mentioned entities; matched
//     memories come from the `memories.entities` JSON column set by the
//     curator apply-layer in unit 3.5)
//
// The three ranked lists (FTS5, vec, graph) fuse via weighted RRF. Weights
// default to fts=1.0, vec=1.0, graph=0.5 per plan §PR 5 unit 5.2; unit 5.2
// wires those to env vars. For unit 5.1 they're constructor defaults + a
// test-override hook on the input.
//
// Result rows carry L0 back-refs as the plan requires: `sources[]` from
// frontmatter + `l0_wikilinks[]` parsed from the body. This is the
// agent-native payload that unit 5.4's `fulcrum memory sources` surface
// extends with resolved file paths.

import type { Db } from 'fulcrum-agent-core'
import { getDb, getReranker, getTextEmbedder } from 'fulcrum-agent-core'
import { extractWikilinks } from '../l1/wikilinks.js'
import {
  buildRecallExplanation,
  type RagGraphContribution,
  type RagRecallExplanation,
  type RagRuntimeDetails,
} from './explain.js'

export interface V3SearchWeights {
  fts?: number
  vec?: number
  graph?: number
}

export interface V3SearchInput {
  workspace_id: string
  project_id?: string | null
  query: string
  limit?: number
  offset?: number
  /** Default 0.3 — matches plan §Retrieval. */
  confidence_floor?: number
  /** Default 2 — plan allows 1-2 hops from query entities. */
  graph_hops?: number
  /** Default false — the plan's audit invariant keeps superseded rows but recall hides them. */
  include_superseded?: boolean
  /** Unit 5.2 wires env defaults; unit 5.1 exposes this for deterministic tests. */
  weights?: V3SearchWeights
  /** Include stable explanation objects on each result. */
  explain?: boolean
}

export interface V3RecallHit {
  memory_id: string
  title: string
  summary: string
  content: string
  confidence: number
  retention_tier: string
  sources: string[]
  l0_wikilinks: string[]
  entities: string[]
  sources_via: string[]
  superseded_by: string | null
  freshness: number
  source: string | null
  score: number
  stage_ranks: { fts?: number; vec?: number; graph?: number; reranker?: number }
  stage_scores: { fts?: number; vec?: number; graph?: number; reranker?: number; fused?: number }
  graph_contribution?: RagGraphContribution
  explanation?: RagRecallExplanation
}

const RRF_K = 60
const PENALTY_RANK = 1000

const HARDCODED_DEFAULT_WEIGHTS: Required<V3SearchWeights> = Object.freeze({ fts: 1.0, vec: 1.0, graph: 0.5 })

/**
 * Parse an RRF weight from an env var. Accepts any non-negative finite
 * number (0 is valid — silences the stage). Unparseable / NaN / negative
 * values fall back to `fallback` so a typo never crashes recall.
 */
function readWeightEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

export function v3DefaultWeights(): Required<V3SearchWeights> {
  return {
    fts: readWeightEnv('FULCRUM_RRF_WS_FTS', HARDCODED_DEFAULT_WEIGHTS.fts),
    vec: readWeightEnv('FULCRUM_RRF_WS_VEC', HARDCODED_DEFAULT_WEIGHTS.vec),
    graph: readWeightEnv('FULCRUM_RRF_WS_GRAPH', HARDCODED_DEFAULT_WEIGHTS.graph),
  }
}

function baseWhere(
  includeSuperseded: boolean,
  projectId: string | null | undefined,
): { sql: string; leadingParams: (string | number)[] } {
  const parts = [
    'm.schema_version >= 3',
    'm.confidence >= ?',
    'm.workspace_id = ?',
  ]
  if (!includeSuperseded) parts.push('m.superseded_by IS NULL')
  const leading: (string | number)[] = []  // floor + workspace_id bound at call site
  if (projectId === null) {
    parts.push('m.project_id IS NULL')
  } else if (projectId !== undefined) {
    parts.push('m.project_id = ?')
    leading.push(projectId)
  }
  return { sql: parts.join(' AND '), leadingParams: leading }
}

export function resolveQueryEntities(
  db: Db,
  query: string,
  workspace_id: string,
): string[] {
  // Case-insensitive substring match against `name` + LIKE scan of `aliases`.
  // The alias column holds a JSON array; SQLite json_each is the portable
  // way to walk it, but LIKE '%"<q>"%' is cheaper for the common case where
  // we're matching a single token.
  const q = query.trim()
  if (!q) return []
  const likeToken = `%${q.toLowerCase()}%`
  const rows = db
    .prepare(
      `SELECT DISTINCT entity_id FROM graph_entities
       WHERE workspace_id = ?
         AND (LOWER(name) LIKE ? OR LOWER(COALESCE(aliases, '')) LIKE ?)`,
    )
    .all(workspace_id, likeToken, likeToken) as Array<{ entity_id: string }>
  return rows.map((r) => r.entity_id)
}

function walkGraph(
  db: Db,
  seed_ids: string[],
  workspace_id: string,
  hops: number,
): Set<string> {
  const reached = new Set<string>(seed_ids)
  if (seed_ids.length === 0 || hops <= 0) return reached
  let frontier = new Set<string>(seed_ids)
  for (let hop = 0; hop < hops; hop++) {
    if (frontier.size === 0) break
    const placeholders = [...frontier].map(() => '?').join(',')
    const rows = db
      .prepare(
        `SELECT source_id, target_id FROM graph_edges
         WHERE workspace_id = ?
           AND (source_id IN (${placeholders}) OR target_id IN (${placeholders}))`,
      )
      .all(workspace_id, ...frontier, ...frontier) as Array<{ source_id: string; target_id: string }>
    const next = new Set<string>()
    for (const edge of rows) {
      for (const endpoint of [edge.source_id, edge.target_id]) {
        if (!reached.has(endpoint)) {
          reached.add(endpoint)
          next.add(endpoint)
        }
      }
    }
    frontier = next
  }
  return reached
}

interface RankMap {
  ranks: Map<string, number>
  graphContributions?: Map<string, RagGraphContribution>
}

function ftsStage(
  db: Db,
  query: string,
  floor: number,
  workspace_id: string,
  whereTail: string,
  whereTailParams: (string | number)[],
  fetchLimit: number,
): RankMap {
  const tokens = query.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { ranks: new Map() }
  const ftsQuery = tokens.map((w) => `"${w.replace(/"/g, '""')}"`).join(' OR ')
  try {
    const rows = db
      .prepare(
        `SELECT m.memory_id, row_number() OVER (ORDER BY f.rank) AS ftsRank
         FROM memories_fts f
         JOIN memories m ON m.rowid = f.rowid
         WHERE f.memories_fts MATCH ?
           AND ${whereTail}
         ORDER BY f.rank
         LIMIT ?`,
      )
      .all(ftsQuery, floor, workspace_id, ...whereTailParams, fetchLimit) as Array<{ memory_id: string; ftsRank: number }>
    return { ranks: new Map(rows.map((r) => [r.memory_id, r.ftsRank])) }
  } catch {
    return { ranks: new Map() }
  }
}

async function vecStage(
  db: Db,
  query: string,
  floor: number,
  workspace_id: string,
  whereTail: string,
  whereTailParams: (string | number)[],
  fetchLimit: number,
): Promise<RankMap> {
  const embedder = getTextEmbedder()
  if (!embedder) return { ranks: new Map() }
  try {
    const embedFn = (embedder.embedQuery ?? embedder.embed).bind(embedder)
    const queryVec = await embedFn(query)
    const buf = Buffer.from(queryVec.buffer)
    const rows = db
      .prepare(
        `SELECT v.memory_id, row_number() OVER (ORDER BY v.distance) AS vecRank
         FROM vec_memories v
         JOIN memories m ON m.memory_id = v.memory_id
         WHERE v.embedding MATCH ?
           AND ${whereTail}
         ORDER BY v.distance
         LIMIT ?`,
      )
      .all(buf, floor, workspace_id, ...whereTailParams, fetchLimit) as Array<{ memory_id: string; vecRank: number }>
    return { ranks: new Map(rows.map((r) => [r.memory_id, r.vecRank])) }
  } catch {
    return { ranks: new Map() }
  }
}

function graphStage(
  db: Db,
  query: string,
  floor: number,
  workspace_id: string,
  hops: number,
  whereTail: string,
  whereTailParams: (string | number)[],
  fetchLimit: number,
): RankMap {
  const seeds = resolveQueryEntities(db, query, workspace_id)
  if (seeds.length === 0) return { ranks: new Map() }
  const reached = walkGraph(db, seeds, workspace_id, hops)
  if (reached.size === 0) return { ranks: new Map() }
  const placeholders = [...reached].map(() => '?').join(',')
  // json_each unrolls memories.entities (a JSON array of entity_ids) and we
  // match against the set of reached entities. ORDER BY last_confirmed DESC
  // gives a deterministic rank within the stage.
  try {
    const rows = db
      .prepare(
        `SELECT DISTINCT m.memory_id, m.updated_at, m.entities
         FROM memories m, json_each(m.entities) j
         WHERE j.value IN (${placeholders})
           AND ${whereTail}
         ORDER BY m.updated_at DESC
         LIMIT ?`,
      )
      .all(...reached, floor, workspace_id, ...whereTailParams, fetchLimit) as Array<{ memory_id: string; entities: string | null }>
    const ranks = new Map<string, number>()
    const graphContributions = new Map<string, RagGraphContribution>()
    rows.forEach((row, i) => {
      const rank = i + 1
      ranks.set(row.memory_id, rank)
      const entities = parseEntities(row.entities)
      graphContributions.set(row.memory_id, {
        affected: true,
        seed_entity_ids: seeds,
        reached_entity_ids: [...reached],
        matched_entity_ids: entities.filter((entityId) => reached.has(entityId)),
        hops,
        rank,
      })
    })
    return { ranks, graphContributions }
  } catch (err) {
    if (process.env['FULCRUM_VERBOSE']) {
      process.stderr.write(`[v3-search] graph stage error: ${err instanceof Error ? err.message : String(err)}\n`)
    }
    return { ranks: new Map() }
  }
}

interface FusionHit {
  memory_id: string
  score: number
  fts_rank?: number
  vec_rank?: number
  graph_rank?: number
  graph_contribution?: RagGraphContribution
}

function fuse(
  fts: RankMap,
  vec: RankMap,
  graph: RankMap,
  weights: Required<V3SearchWeights>,
): FusionHit[] {
  const allIds = new Set<string>([...fts.ranks.keys(), ...vec.ranks.keys(), ...graph.ranks.keys()])
  const hits: FusionHit[] = []
  for (const id of allIds) {
    const fr = fts.ranks.get(id)
    const vr = vec.ranks.get(id)
    const gr = graph.ranks.get(id)
    const score =
      weights.fts / (RRF_K + (fr ?? PENALTY_RANK)) +
      weights.vec / (RRF_K + (vr ?? PENALTY_RANK)) +
      weights.graph / (RRF_K + (gr ?? PENALTY_RANK))
    const hit: FusionHit = { memory_id: id, score }
    if (fr !== undefined) hit.fts_rank = fr
    if (vr !== undefined) hit.vec_rank = vr
    if (gr !== undefined) {
      hit.graph_rank = gr
      hit.graph_contribution = graph.graphContributions?.get(id)
    }
    hits.push(hit)
  }
  hits.sort((a, b) => b.score - a.score)
  return hits
}

interface MemoryRow {
  memory_id: string
  title: string
  summary: string
  content: string
  confidence: number
  freshness: number
  retention_tier: string
  entities: string | null
  provenance: string | null
  source: string | null
  superseded_by: string | null
}

function materialize(db: Db, hits: FusionHit[]): V3RecallHit[] {
  if (hits.length === 0) return []
  const placeholders = hits.map(() => '?').join(',')
  const ids = hits.map((h) => h.memory_id)
  const rows = db
    .prepare(
      `SELECT memory_id, title, summary, content, confidence, freshness, retention_tier,
              entities, provenance, source, superseded_by
       FROM memories
       WHERE memory_id IN (${placeholders})`,
    )
    .all(...ids) as MemoryRow[]
  const rowById = new Map(rows.map((r) => [r.memory_id, r]))
  const out: V3RecallHit[] = []
  for (const hit of hits) {
    const row = rowById.get(hit.memory_id)
    if (!row) continue
    const sources = parseSources(row.provenance)
    const sources_via = parseSourcesVia(row.provenance)
    const entities = parseEntities(row.entities)
    const l0_wikilinks = extractWikilinks(row.content).filter((w) => w.startsWith('raw/'))
    const stage_ranks: V3RecallHit['stage_ranks'] = {}
    const stage_scores: V3RecallHit['stage_scores'] = {}
    if (hit.fts_rank !== undefined) stage_ranks.fts = hit.fts_rank
    if (hit.vec_rank !== undefined) stage_ranks.vec = hit.vec_rank
    if (hit.graph_rank !== undefined) stage_ranks.graph = hit.graph_rank
    if (hit.fts_rank !== undefined) stage_scores.fts = 1 / (RRF_K + hit.fts_rank)
    if (hit.vec_rank !== undefined) stage_scores.vec = 1 / (RRF_K + hit.vec_rank)
    if (hit.graph_rank !== undefined) stage_scores.graph = 1 / (RRF_K + hit.graph_rank)
    stage_scores.fused = hit.score
    out.push({
      memory_id: row.memory_id,
      title: row.title,
      summary: row.summary,
      content: row.content,
      confidence: row.confidence,
      freshness: row.freshness,
      retention_tier: row.retention_tier,
      sources,
      sources_via,
      l0_wikilinks,
      entities,
      superseded_by: row.superseded_by,
      source: row.source,
      score: hit.score,
      stage_ranks,
      stage_scores,
      graph_contribution: hit.graph_contribution,
    })
  }
  return out
}

function sigmoidScore(logit: number): number {
  return 1 / (1 + Math.exp(-logit))
}

async function rerankMaterialized(query: string, hits: V3RecallHit[]): Promise<V3RecallHit[]> {
  const reranker = getReranker()
  if (!reranker || hits.length <= 1) return hits

  try {
    const passages = hits.map((h) => h.content || h.summary || h.title)
    const rerankScores = await reranker.rerank(query, passages)
    const reranked = hits
      .map((h, i) => {
        const score = rerankScores[i]
        if (typeof score !== 'number' || !Number.isFinite(score)) return h
        const rerankerScore = sigmoidScore(score)
        return {
          ...h,
          score: rerankerScore,
          stage_scores: { ...h.stage_scores, reranker: rerankerScore, fused: rerankerScore },
        }
      })
      .sort((a, b) => b.score - a.score)
    return reranked.map((h, i) => ({
      ...h,
      stage_ranks: { ...h.stage_ranks, reranker: i + 1 },
    }))
  } catch (err) {
    if (process.env['FULCRUM_VERBOSE']) {
      process.stderr.write(`[v3-search] reranker degraded: ${err instanceof Error ? err.message : String(err)}\n`)
    }
    return hits
  }
}

function parseSources(provenance: string | null): string[] {
  if (!provenance) return []
  try {
    const parsed = JSON.parse(provenance) as { sources?: unknown }
    if (!Array.isArray(parsed.sources)) return []
    return parsed.sources.filter((s): s is string => typeof s === 'string')
  } catch {
    return []
  }
}

function parseSourcesVia(provenance: string | null): string[] {
  if (!provenance) return []
  try {
    const parsed = JSON.parse(provenance) as { sources_via?: unknown }
    if (!Array.isArray(parsed.sources_via)) return []
    return parsed.sources_via.filter((s): s is string => typeof s === 'string')
  } catch {
    return []
  }
}

function parseEntities(entities: string | null): string[] {
  if (!entities) return []
  try {
    const parsed = JSON.parse(entities) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((s): s is string => typeof s === 'string')
  } catch {
    return []
  }
}

type RuntimeAwareProvider = {
  provider?: unknown
  model?: unknown
  device?: unknown
  actualDevice?: unknown
  actual_device?: unknown
  fallbackReason?: unknown
  fallback_reason?: unknown
  constructor?: { name?: string }
}

function runtimeFromProvider(provider: unknown, latencyMs: number): RagRuntimeDetails {
  const runtime = provider as RuntimeAwareProvider | null
  const ctorName = runtime?.constructor?.name
  const providerName = typeof runtime?.provider === 'string'
    ? runtime.provider
    : (ctorName ? (ctorName.includes('Local') ? 'local' : 'custom') : null)
  const model = typeof runtime?.model === 'string' ? runtime.model : (ctorName ?? null)
  const requestedDevice = typeof runtime?.device === 'string' ? runtime.device : null
  const actualDevice = typeof runtime?.actualDevice === 'string'
    ? runtime.actualDevice
    : (typeof runtime?.actual_device === 'string'
        ? runtime.actual_device
        : null)
  const fallbackReason = typeof runtime?.fallbackReason === 'string'
    ? runtime.fallbackReason
    : (typeof runtime?.fallback_reason === 'string' ? runtime.fallback_reason : null)
  return {
    provider: providerName,
    model,
    requested_device: requestedDevice,
    actual_device: actualDevice,
    fallback_reason: fallbackReason,
    latency_ms: latencyMs,
  }
}

function maybeExplainHits(
  hits: V3RecallHit[],
  input: V3SearchInput,
  db: Db,
  runtime: RagRuntimeDetails,
): V3RecallHit[] {
  if (!input.explain) return hits
  return hits.map((hit) => ({
    ...hit,
    explanation: buildRecallExplanation({
      db,
      workspace_id: input.workspace_id,
      hit,
      runtime,
    }),
  }))
}

export async function runV3Search(
  input: V3SearchInput,
  db: Db = getDb(),
): Promise<V3RecallHit[]> {
  const startedAt = Date.now()
  const floor = input.confidence_floor ?? 0.3
  const limit = input.limit ?? 10
  const offset = input.offset ?? 0
  const hops = input.graph_hops ?? 2
  const includeSuperseded = input.include_superseded ?? false
  const weights: Required<V3SearchWeights> = {
    ...v3DefaultWeights(),
    ...(input.weights ?? {}),
  }
  const { sql: whereTail, leadingParams } = baseWhere(includeSuperseded, input.project_id)
  const fetchLimit = (limit + offset) * 3

  const fts = ftsStage(db, input.query, floor, input.workspace_id, whereTail, leadingParams, fetchLimit)
  const vec = await vecStage(db, input.query, floor, input.workspace_id, whereTail, leadingParams, fetchLimit)
  const graph = graphStage(db, input.query, floor, input.workspace_id, hops, whereTail, leadingParams, fetchLimit)
  const fused = fuse(fts, vec, graph, weights)
  const reranker = getReranker()
  const runtimeProvider = reranker ?? getTextEmbedder()
  if (!reranker) {
    const hits = materialize(db, fused.slice(offset, offset + limit))
    return maybeExplainHits(hits, input, db, runtimeFromProvider(runtimeProvider, Date.now() - startedAt))
  }

  const candidates = materialize(db, fused.slice(0, fetchLimit))
  const reranked = await rerankMaterialized(input.query, candidates)
  const hits = reranked.slice(offset, offset + limit)
  return maybeExplainHits(hits, input, db, runtimeFromProvider(runtimeProvider, Date.now() - startedAt))
}
