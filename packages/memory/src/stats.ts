// packages/memory/src/stats.ts
//
// Memory v3 PR 8 unit 8.3 — `computeMemoryV3Stats`.
//
// Single source of truth for the `/memory/stats` monitor endpoint. Also
// callable from a future `fulcrum memory stats` CLI so the HTTP surface
// and operator tooling share one shape.
//
// Stats layout (public contract — additive changes only):
//   l0.total                     — count of l0_sources rows (workspace scope)
//   l0.ingest_rate_per_hour      — rows inserted in the last hour
//   l1.total                     — live v3 memories (schema_version >= 3, not superseded)
//   l1.superseded                — superseded v3 memories
//   l1.by_tier                   — {working, episodic, semantic, procedural}
//   l1.confidence_histogram      — 10 buckets over [0.0, 1.0]
//   graph.nodes                  — graph_entities rows (workspace scope)
//   graph.edges                  — graph_edges rows (workspace scope)
//   curation.runs_last_24h       — curator log entries in the last 24h
//   curation.p50_duration_ms     — 50th-pct latency (null when no data)
//   curation.p95_duration_ms     — 95th-pct latency (null when no data)
//
// The curator-log parse is best-effort: malformed JSONL lines are skipped;
// missing file yields zero-filled curation stats.

import type Database from 'better-sqlite3'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export interface MemoryV3Stats {
  l0: {
    total: number
    ingest_rate_per_hour: number
  }
  l1: {
    total: number
    superseded: number
    by_tier: {
      working: number
      episodic: number
      semantic: number
      procedural: number
    }
    confidence_histogram: Array<{ bucket: string; count: number }>
  }
  graph: {
    nodes: number
    edges: number
  }
  curation: {
    runs_last_24h: number
    p50_duration_ms: number | null
    p95_duration_ms: number | null
  }
}

export interface MemoryV3StatsOptions {
  workspace_id: string
  vaultPath: string
  /** Clock override for deterministic tests. Defaults to Date.now(). */
  now?: () => number
}

type TierName = 'working' | 'episodic' | 'semantic' | 'procedural'
const TIER_NAMES: readonly TierName[] = ['working', 'episodic', 'semantic', 'procedural']

function makeHistogramScaffold(): Array<{ bucket: string; count: number }> {
  const out: Array<{ bucket: string; count: number }> = []
  for (let i = 0; i < 10; i++) {
    const lo = (i / 10).toFixed(1)
    const hi = ((i + 1) / 10).toFixed(1)
    out.push({ bucket: `${lo}-${hi}`, count: 0 })
  }
  return out
}

function bucketFor(confidence: number): number {
  if (confidence >= 1) return 9
  if (confidence < 0) return 0
  return Math.min(9, Math.floor(confidence * 10))
}

function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null
  // Nearest-rank method.
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(p * sortedAsc.length) - 1))
  return sortedAsc[idx] ?? null
}

interface CuratorLogRow {
  ts?: string
  duration_ms?: number
}

export function computeMemoryV3Stats(
  db: Database.Database,
  opts: MemoryV3StatsOptions,
): MemoryV3Stats {
  const ws = opts.workspace_id
  const now = opts.now ? opts.now() : Date.now()

  // ── L0 ─────────────────────────────────────────────────────────────────
  const l0Total = (db.prepare(
    `SELECT COUNT(*) AS c FROM l0_sources WHERE workspace_id = ?`,
  ).get(ws) as { c: number }).c
  const oneHourAgoIso = new Date(now - 60 * 60 * 1000).toISOString()
  const l0Rate = (db.prepare(
    `SELECT COUNT(*) AS c FROM l0_sources WHERE workspace_id = ? AND created_at >= ?`,
  ).get(ws, oneHourAgoIso) as { c: number }).c

  // ── L1 ─────────────────────────────────────────────────────────────────
  const l1Rows = db.prepare(
    `SELECT retention_tier, confidence, (superseded_by IS NOT NULL) AS is_superseded
       FROM memories
      WHERE workspace_id = ? AND schema_version >= 3`,
  ).all(ws) as Array<{ retention_tier: string | null; confidence: number; is_superseded: number }>

  const byTier = { working: 0, episodic: 0, semantic: 0, procedural: 0 }
  const histogram = makeHistogramScaffold()
  let live = 0
  let superseded = 0
  for (const row of l1Rows) {
    if (row.is_superseded) {
      superseded++
      continue
    }
    live++
    const tier = row.retention_tier as TierName | null
    if (tier && TIER_NAMES.includes(tier)) byTier[tier]++
    histogram[bucketFor(row.confidence)]!.count++
  }

  // ── Graph ──────────────────────────────────────────────────────────────
  const graphNodes = (db.prepare(
    `SELECT COUNT(*) AS c FROM graph_entities WHERE workspace_id = ?`,
  ).get(ws) as { c: number }).c
  const graphEdges = (db.prepare(
    `SELECT COUNT(*) AS c FROM graph_edges WHERE workspace_id = ?`,
  ).get(ws) as { c: number }).c

  // ── Curation latency (from vault/curated/log.md) ──────────────────────
  const logPath = join(opts.vaultPath, 'curated', 'log.md')
  let runs_last_24h = 0
  let p50: number | null = null
  let p95: number | null = null
  if (existsSync(logPath)) {
    const content = readFileSync(logPath, 'utf-8')
    const cutoff = now - 24 * 60 * 60 * 1000
    const durations: number[] = []
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const row = JSON.parse(trimmed) as CuratorLogRow
        if (typeof row.duration_ms !== 'number') continue
        const ts = row.ts ? Date.parse(row.ts) : NaN
        if (!Number.isFinite(ts) || ts < cutoff) continue
        durations.push(row.duration_ms)
      } catch {
        // malformed line — best-effort skip
      }
    }
    runs_last_24h = durations.length
    const sorted = [...durations].sort((a, b) => a - b)
    p50 = percentile(sorted, 0.5)
    p95 = percentile(sorted, 0.95)
  }

  return {
    l0: { total: l0Total, ingest_rate_per_hour: l0Rate },
    l1: {
      total: live,
      superseded,
      by_tier: byTier,
      confidence_histogram: histogram,
    },
    graph: { nodes: graphNodes, edges: graphEdges },
    curation: { runs_last_24h, p50_duration_ms: p50, p95_duration_ms: p95 },
  }
}
