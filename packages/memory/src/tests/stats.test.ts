// packages/memory/src/tests/stats.test.ts
//
// Memory v3 PR 8 unit 8.3 — `computeMemoryV3Stats` against a seeded in-memory
// DB. The function is pulled out of the HTTP surface so both the monitor and
// future CLI (`fulcrum memory stats`) can share one implementation.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Database from 'better-sqlite3'
import { runMigrations } from 'fulcrum-agent-core'
import { runMigration101MemoryV3Lifecycle } from '../schema.js'
import { computeMemoryV3Stats } from '../stats.js'

let db: Database.Database
let tmpVault: string

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
  runMigration101MemoryV3Lifecycle(db)
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-stats-'))
  mkdirSync(join(tmpVault, 'curated'), { recursive: true })
})
afterEach(() => {
  try { db.close() } catch { /* noop */ }
  rmSync(tmpVault, { recursive: true, force: true })
})

// ── Seed helpers ──────────────────────────────────────────────────────────

function seedWorkspace(ws: string): void {
  db.prepare('INSERT INTO workspaces (workspace_id, name) VALUES (?, ?)').run(ws, ws)
}

function seedL0(ws: string, id: string, createdAtIso: string): void {
  db.prepare(
    `INSERT INTO l0_sources (source_id, source_type, session_id, workspace_id, project_id, cwd,
                             vault_path, content_hash, size_bytes, created_at)
     VALUES (?, 'bash_trace', null, ?, null, null, ?, ?, ?, ?)`,
  ).run(id, ws, `raw/bash_trace/2026/04/19/${id}.md`, 'h', 10, createdAtIso)
}

function seedL1(
  ws: string,
  id: string,
  opts: {
    tier: 'working' | 'episodic' | 'semantic' | 'procedural'
    confidence: number
    superseded?: boolean
  },
): void {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO memories (
       memory_id, workspace_id, project_id, kind, scope, content, created_at, updated_at,
       access_count, confidence, retention_tier, schema_version, superseded_by,
       entities, title, summary, slug, vault_path, content_hash, provenance,
       supersedes, consolidated_from_ids, confidence_decay_at, embedded
     ) VALUES (?, ?, null, 'page', 'global', 'body', ?, ?, 0, ?, ?, 3, ?,
               '[]', ?, ?, ?, ?, 'h', '{}', null, null, ?, 0)`,
  ).run(
    id, ws, now, now, opts.confidence, opts.tier, opts.superseded ? 'other_id' : null,
    id, id, id, `curated/pages/${id}.md`, now,
  )
}

function seedGraphEntity(ws: string, id: string): void {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO graph_entities (entity_id, workspace_id, name, entity_type, created_at, updated_at)
     VALUES (?, ?, ?, 'library', ?, ?)`,
  ).run(id, ws, id, now, now)
}

function seedGraphEdge(ws: string, id: string, src: string, tgt: string): void {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO graph_edges (edge_id, workspace_id, source_id, target_id, relation, created_at)
     VALUES (?, ?, ?, ?, 'mentions', ?)`,
  ).run(id, ws, src, tgt, now)
}

function writeCuratorLog(vault: string, entries: Array<{ duration_ms: number; ts: string }>): void {
  const body = entries.map((e) => JSON.stringify({
    ts: e.ts,
    l0_id: 'l0src_x',
    task: 'extraction',
    backend: 'codex',
    model: 'gpt-5-mini',
    prompt_version: 'v3.0.0',
    duration_ms: e.duration_ms,
    dry_run: false,
    affected_pages: { created: [], updated: [], superseded: [] },
    new_edges: [],
    confidence_deltas: { created: [], updated: [], superseded: [] },
  })).join('\n') + (entries.length > 0 ? '\n' : '')
  writeFileSync(join(vault, 'curated', 'log.md'), body)
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('computeMemoryV3Stats — shape', () => {
  it('returns zeroed stats against an empty workspace', () => {
    seedWorkspace('ws_empty')
    const s = computeMemoryV3Stats(db, { workspace_id: 'ws_empty', vaultPath: tmpVault })
    expect(s.l0).toEqual({ total: 0, ingest_rate_per_hour: 0 })
    expect(s.l1.total).toBe(0)
    expect(s.l1.superseded).toBe(0)
    expect(s.l1.by_tier).toEqual({ working: 0, episodic: 0, semantic: 0, procedural: 0 })
    expect(s.l1.confidence_histogram).toHaveLength(10)
    expect(s.l1.confidence_histogram.every((b) => b.count === 0)).toBe(true)
    expect(s.graph).toEqual({ nodes: 0, edges: 0 })
    expect(s.curation.runs_last_24h).toBe(0)
    expect(s.curation.p50_duration_ms).toBeNull()
    expect(s.curation.p95_duration_ms).toBeNull()
  })
})

describe('computeMemoryV3Stats — L0', () => {
  it('counts total l0_sources and ingest rate over the last hour', () => {
    seedWorkspace('ws_a')
    // 3 rows in the last hour, 1 row > 1h ago → rate=3, total=4.
    const nowIso = new Date().toISOString()
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    seedL0('ws_a', 'l0src_a1', nowIso)
    seedL0('ws_a', 'l0src_a2', nowIso)
    seedL0('ws_a', 'l0src_a3', nowIso)
    seedL0('ws_a', 'l0src_a4', twoHoursAgo)
    const s = computeMemoryV3Stats(db, { workspace_id: 'ws_a', vaultPath: tmpVault })
    expect(s.l0.total).toBe(4)
    expect(s.l0.ingest_rate_per_hour).toBe(3)
  })

  it('filters by workspace', () => {
    seedWorkspace('ws_a')
    seedWorkspace('ws_b')
    const nowIso = new Date().toISOString()
    seedL0('ws_a', 'l0src_a1', nowIso)
    seedL0('ws_b', 'l0src_b1', nowIso)
    seedL0('ws_b', 'l0src_b2', nowIso)
    const s = computeMemoryV3Stats(db, { workspace_id: 'ws_a', vaultPath: tmpVault })
    expect(s.l0.total).toBe(1)
    expect(s.l0.ingest_rate_per_hour).toBe(1)
  })
})

describe('computeMemoryV3Stats — L1 tiers + supersession', () => {
  it('groups live L1 pages by retention_tier', () => {
    seedWorkspace('ws_a')
    seedL1('ws_a', 'p1', { tier: 'working', confidence: 0.5 })
    seedL1('ws_a', 'p2', { tier: 'working', confidence: 0.7 })
    seedL1('ws_a', 'p3', { tier: 'episodic', confidence: 0.8 })
    seedL1('ws_a', 'p4', { tier: 'semantic', confidence: 0.9 })
    seedL1('ws_a', 'p5', { tier: 'procedural', confidence: 1.0 })
    const s = computeMemoryV3Stats(db, { workspace_id: 'ws_a', vaultPath: tmpVault })
    expect(s.l1.total).toBe(5)
    expect(s.l1.by_tier.working).toBe(2)
    expect(s.l1.by_tier.episodic).toBe(1)
    expect(s.l1.by_tier.semantic).toBe(1)
    expect(s.l1.by_tier.procedural).toBe(1)
    expect(s.l1.superseded).toBe(0)
  })

  it('counts superseded pages separately and excludes them from by_tier', () => {
    seedWorkspace('ws_a')
    seedL1('ws_a', 'p1', { tier: 'working', confidence: 0.6 })
    seedL1('ws_a', 'p2', { tier: 'working', confidence: 0.7, superseded: true })
    const s = computeMemoryV3Stats(db, { workspace_id: 'ws_a', vaultPath: tmpVault })
    expect(s.l1.total).toBe(1)
    expect(s.l1.by_tier.working).toBe(1)
    expect(s.l1.superseded).toBe(1)
  })
})

describe('computeMemoryV3Stats — confidence histogram', () => {
  it('buckets by 0.1 over [0.0, 1.0]', () => {
    seedWorkspace('ws_a')
    seedL1('ws_a', 'p0', { tier: 'working', confidence: 0.05 })  // [0.0, 0.1)
    seedL1('ws_a', 'p1', { tier: 'working', confidence: 0.25 })  // [0.2, 0.3)
    seedL1('ws_a', 'p2', { tier: 'working', confidence: 0.25 })  // [0.2, 0.3)
    seedL1('ws_a', 'p3', { tier: 'working', confidence: 0.99 })  // [0.9, 1.0]
    seedL1('ws_a', 'p4', { tier: 'working', confidence: 1.00 })  // [0.9, 1.0]
    const s = computeMemoryV3Stats(db, { workspace_id: 'ws_a', vaultPath: tmpVault })
    const h = s.l1.confidence_histogram
    expect(h[0]!.count).toBe(1)  // 0.05
    expect(h[2]!.count).toBe(2)  // 0.25, 0.25
    expect(h[9]!.count).toBe(2)  // 0.99 + 1.00
    expect(h[9]!.bucket).toBe('0.9-1.0')
    expect(h[0]!.bucket).toBe('0.0-0.1')
  })
})

describe('computeMemoryV3Stats — graph', () => {
  it('counts graph_entities and graph_edges per workspace', () => {
    seedWorkspace('ws_a')
    seedWorkspace('ws_b')
    seedGraphEntity('ws_a', 'e1')
    seedGraphEntity('ws_a', 'e2')
    seedGraphEntity('ws_b', 'e3')
    seedGraphEdge('ws_a', 'edge1', 'e1', 'e2')
    seedGraphEdge('ws_b', 'edge2', 'e3', 'e3')
    const s = computeMemoryV3Stats(db, { workspace_id: 'ws_a', vaultPath: tmpVault })
    expect(s.graph.nodes).toBe(2)
    expect(s.graph.edges).toBe(1)
  })
})

describe('computeMemoryV3Stats — curation latency', () => {
  it('parses curator log.md for p50 + p95 over the last 24h', () => {
    seedWorkspace('ws_a')
    const now = Date.now()
    const isoNow = new Date(now).toISOString()
    writeCuratorLog(tmpVault, [
      { duration_ms: 100, ts: isoNow },
      { duration_ms: 200, ts: isoNow },
      { duration_ms: 300, ts: isoNow },
      { duration_ms: 400, ts: isoNow },
      { duration_ms: 500, ts: isoNow },
      { duration_ms: 600, ts: isoNow },
      { duration_ms: 700, ts: isoNow },
      { duration_ms: 800, ts: isoNow },
      { duration_ms: 900, ts: isoNow },
      { duration_ms: 1000, ts: isoNow },
    ])
    const s = computeMemoryV3Stats(db, { workspace_id: 'ws_a', vaultPath: tmpVault })
    expect(s.curation.runs_last_24h).toBe(10)
    // p50 of [100..1000] (step 100) — nearest-rank: ceil(0.50 * 10) = 5th → 500
    expect(s.curation.p50_duration_ms).toBe(500)
    // p95 — ceil(0.95 * 10) = 10th → 1000
    expect(s.curation.p95_duration_ms).toBe(1000)
  })

  it('skips entries older than 24h', () => {
    seedWorkspace('ws_a')
    const now = Date.now()
    const recent = new Date(now).toISOString()
    const old = new Date(now - 25 * 60 * 60 * 1000).toISOString()
    writeCuratorLog(tmpVault, [
      { duration_ms: 999, ts: old },
      { duration_ms: 100, ts: recent },
      { duration_ms: 200, ts: recent },
    ])
    const s = computeMemoryV3Stats(db, { workspace_id: 'ws_a', vaultPath: tmpVault })
    expect(s.curation.runs_last_24h).toBe(2)
  })

  it('returns nulls when the log is missing or empty', () => {
    seedWorkspace('ws_a')
    const s = computeMemoryV3Stats(db, { workspace_id: 'ws_a', vaultPath: tmpVault })
    expect(s.curation.runs_last_24h).toBe(0)
    expect(s.curation.p50_duration_ms).toBeNull()
    expect(s.curation.p95_duration_ms).toBeNull()
  })

  it('tolerates malformed JSONL lines', () => {
    seedWorkspace('ws_a')
    const logPath = join(tmpVault, 'curated', 'log.md')
    const good = JSON.stringify({
      ts: new Date().toISOString(),
      duration_ms: 100,
      task: 'extraction',
      backend: 'codex',
      model: 'x',
      prompt_version: 'v3.0.0',
      dry_run: false,
      affected_pages: { created: [], updated: [], superseded: [] },
      new_edges: [],
      confidence_deltas: { created: [], updated: [], superseded: [] },
      l0_id: 'l0src_x',
    })
    writeFileSync(logPath, `${good}\nnot-json\n${good}\n`)
    const s = computeMemoryV3Stats(db, { workspace_id: 'ws_a', vaultPath: tmpVault })
    expect(s.curation.runs_last_24h).toBe(2)
  })
})
