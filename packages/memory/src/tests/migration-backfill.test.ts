// packages/memory/src/tests/migration-backfill.test.ts
//
// Memory v3 PR 6 unit 6.3 — DB backfill.
//
// For each MigrationRecord (produced by 6.2):
//   L0_raw          → INSERT OR IGNORE INTO l0_sources (source_id=memory_id);
//                     DELETE FROM memories (cascades to memory_entities/task_memory_links/
//                     artifact_memory_links via FK; vec_memories + memory_tags +
//                     memory_wikilinks + memory_recall_events cleaned explicitly).
//   L1_curated_stub → UPDATE memories SET schema_version=3, retention_tier='working',
//                     confidence_decay_at=now(), confidence=0.5, vault_path=...,
//                     provenance=json_object('sources', json('[]')).
//   unknown         → skipped.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getDb, newId } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { runMigration101MemoryV3Lifecycle } from '../schema.js'
import { classifyMemoriesForMigration } from '../migration/classifier.js'
import { migrateAllMemories } from '../migration/migrator.js'
import { applyDbBackfill } from '../migration/backfill.js'

let tmpVault: string

function seedMemory(
  kind: string,
  opts: { id?: string; content?: string; title?: string; workspaceId?: string; sessionId?: string; createdAt?: string } = {},
): string {
  const db = getDb()
  const id = opts.id ?? newId('memory')
  db.prepare(`
    INSERT INTO memories(memory_id, workspace_id, project_id, scope, kind, title, summary, content, session_id, created_at)
    VALUES(?, ?, ?, 'project', ?, ?, '', ?, ?, ?)
  `).run(
    id,
    opts.workspaceId ?? 'ws_mig',
    'proj_mig',
    kind,
    opts.title ?? '',
    opts.content ?? 'body',
    opts.sessionId ?? null,
    opts.createdAt ?? '2026-03-15T10:30:00.000Z',
  )
  return id
}

beforeEach(() => {
  createTestDb()
  runMigration101MemoryV3Lifecycle(getDb())
  seedWorkspaceAndProject(getDb(), 'ws_mig', 'proj_mig')
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-mig-backfill-'))
})

afterEach(() => {
  resetTestDb()
  rmSync(tmpVault, { recursive: true, force: true })
})

function migrateThenBackfill(opts: { dry_run?: boolean } = {}) {
  const batch = migrateAllMemories(tmpVault, getDb())
  return applyDbBackfill(getDb(), batch.manifest, opts)
}

describe('applyDbBackfill — L0_raw', () => {
  it('inserts one l0_sources row per L0 manifest entry with source_id=memory_id', () => {
    const id = seedMemory('bash_trace', { content: 'payload', sessionId: 'sess_1' })
    migrateThenBackfill()

    const row = getDb().prepare('SELECT * FROM l0_sources WHERE source_id = ?').get(id) as any
    expect(row).toBeTruthy()
    expect(row.source_type).toBe('bash_trace')
    expect(row.session_id).toBe('sess_1')
    expect(row.workspace_id).toBe('ws_mig')
    expect(row.project_id).toBe('proj_mig')
    expect(row.vault_path).toMatch(/^raw\/bash_trace\/2026\/03\/15\//)
    expect(row.content_hash).toBe(require('crypto').createHash('sha256').update('payload').digest('hex'))
    expect(row.size_bytes).toBe('payload'.length)
  })

  it('deletes the memories row for each L0 entry', () => {
    const id = seedMemory('file_patch', { content: 'diff' })
    migrateThenBackfill()
    const hit = getDb().prepare('SELECT memory_id FROM memories WHERE memory_id = ?').get(id)
    expect(hit).toBeUndefined()
  })

  it('session_summary kind lands with source_type=session_transcript (classifier alias)', () => {
    const id = seedMemory('session_summary', { content: 'x' })
    migrateThenBackfill()
    const row = getDb().prepare('SELECT source_type FROM l0_sources WHERE source_id = ?').get(id) as any
    expect(row?.source_type).toBe('session_transcript')
  })

  it('cleans up orphan memory_tags / memory_wikilinks / memory_recall_events on L0 delete', () => {
    const id = seedMemory('bash_trace', { content: 'x' })
    const db = getDb()
    db.prepare('INSERT INTO memory_tags(memory_id, tag) VALUES(?, ?)').run(id, 'tag1')
    db.prepare('INSERT INTO memory_wikilinks(src_memory_id, dst_slug) VALUES(?, ?)').run(id, 'slug1')
    db.prepare(`INSERT INTO memory_recall_events(memory_id, query, score, rank, source, created_at) VALUES(?, 'q', 1.0, 1, 'test', 0)`).run(id)

    migrateThenBackfill()

    expect(db.prepare('SELECT * FROM memory_tags WHERE memory_id = ?').get(id)).toBeUndefined()
    expect(db.prepare('SELECT * FROM memory_wikilinks WHERE src_memory_id = ?').get(id)).toBeUndefined()
    expect(db.prepare('SELECT * FROM memory_recall_events WHERE memory_id = ?').get(id)).toBeUndefined()
  })

  it('re-run is idempotent: INSERT OR IGNORE + memories already gone → counts unchanged on 2nd pass', () => {
    seedMemory('bash_trace', { content: 'a' })
    seedMemory('file_patch', { content: 'b' })

    const first = migrateThenBackfill()
    expect(first.counts.l0_inserted).toBe(2)
    expect(first.counts.l0_deleted).toBe(2)

    // Second pass: memories are gone, so classifier returns nothing. Re-running
    // backfill on an empty manifest is a no-op.
    const second = migrateThenBackfill()
    expect(second.counts.l0_inserted).toBe(0)
    expect(second.counts.l0_deleted).toBe(0)

    // l0_sources rows survive unchanged.
    const n = getDb().prepare('SELECT COUNT(*) AS n FROM l0_sources').get() as { n: number }
    expect(n.n).toBe(2)
  })
})

describe('applyDbBackfill — L1_curated_stub', () => {
  it('bumps schema_version to 3 and sets v3 lifecycle columns', () => {
    const id = seedMemory('decision', { content: 'decision body' })
    migrateThenBackfill()

    const row = getDb().prepare(`
      SELECT schema_version, retention_tier, confidence_decay_at, confidence, vault_path, provenance
      FROM memories WHERE memory_id = ?
    `).get(id) as any
    expect(row.schema_version).toBe(3)
    expect(row.retention_tier).toBe('working')
    expect(row.confidence_decay_at).toBeTruthy()
    expect(row.confidence).toBeCloseTo(0.5)
    expect(row.vault_path).toBe(`curated/pages/${id}.md`)
    expect(JSON.parse(row.provenance).sources).toEqual([])
  })

  it('row becomes visible via the l1_pages view after backfill', () => {
    const id = seedMemory('identity', { title: 'Bob' })
    migrateThenBackfill()
    const hit = getDb().prepare('SELECT page_id, page_type, retention_tier FROM l1_pages WHERE page_id = ?').get(id) as any
    expect(hit?.page_id).toBe(id)
    expect(hit?.page_type).toBe('identity') // memories.kind still = 'identity'; page_type alias of kind
    expect(hit?.retention_tier).toBe('working')
  })

  it('re-run is idempotent: already-migrated rows are skipped', () => {
    seedMemory('decision')
    seedMemory('fact')
    const first = migrateThenBackfill()
    expect(first.counts.l1_backfilled).toBe(2)

    const second = migrateThenBackfill()
    expect(second.counts.l1_backfilled).toBe(0)
  })

  it('preserves memory_id — existing references still resolve', () => {
    const id = seedMemory('decision', { content: 'x' })
    migrateThenBackfill()
    const hit = getDb().prepare('SELECT memory_id FROM memories WHERE memory_id = ?').get(id) as any
    expect(hit?.memory_id).toBe(id)
  })
})

describe('applyDbBackfill — unknown', () => {
  it('leaves unknown-kind rows untouched', () => {
    const id = seedMemory('entity', { content: 'graph node' }) // v2b kind
    migrateThenBackfill()
    const row = getDb().prepare('SELECT schema_version, kind FROM memories WHERE memory_id = ?').get(id) as any
    expect(row.kind).toBe('entity')
    expect(row.schema_version).not.toBe(3)
  })
})

describe('applyDbBackfill — dry_run', () => {
  it('dry_run=true writes nothing to DB but returns would-be counts', () => {
    const l0 = seedMemory('bash_trace', { content: 'a' })
    const l1 = seedMemory('decision', { content: 'b' })

    const out = migrateThenBackfill({ dry_run: true })
    expect(out.counts.l0_inserted).toBe(1)
    expect(out.counts.l1_backfilled).toBe(1)

    // DB state unchanged:
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM l0_sources').get()).toEqual({ n: 0 })
    const l0row = getDb().prepare('SELECT memory_id FROM memories WHERE memory_id = ?').get(l0) as any
    expect(l0row?.memory_id).toBe(l0)
    const l1row = getDb().prepare('SELECT schema_version FROM memories WHERE memory_id = ?').get(l1) as any
    expect(l1row?.schema_version).not.toBe(3)
  })
})

describe('applyDbBackfill — errors', () => {
  it('collects per-row errors without aborting the batch', () => {
    const good = seedMemory('bash_trace', { content: 'good' })
    const bad = seedMemory('bash_trace', { content: 'bad' })

    // Fabricate an invalid manifest entry — null content_hash trips the
    // l0_sources.content_hash NOT NULL constraint — and verify the batch
    // surfaces it as an error while the good row still writes through.
    const batch = migrateAllMemories(tmpVault, getDb())
    const manifest = batch.manifest.map(r =>
      r.memory_id === bad
        ? ({ ...r, content_hash: null as unknown as string })
        : r,
    )
    const out = applyDbBackfill(getDb(), manifest)
    expect(out.counts.l0_inserted).toBe(1)
    expect(out.errors.length).toBeGreaterThanOrEqual(1)
    expect(out.errors.find(e => e.memory_id === bad)).toBeDefined()
    // Good row still deleted + inserted.
    expect(getDb().prepare('SELECT source_id FROM l0_sources WHERE source_id = ?').get(good)).toBeTruthy()
  })
})
