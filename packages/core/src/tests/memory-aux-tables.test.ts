import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { closeDb, _configureDb } from '../db/client.js'
import { runMigrations } from '../db/migrations.js'

/**
 * v2a PR 1 Task 4 — memory_recall_events / memory_wikilinks / memory_tags tables.
 *
 * Asserts the exact DDL from §3.3, §3.3a, §3.3b of the v2 spec lands in the
 * schema. The recall-events ledger feeds Dreaming promotion (v2b PR 11). The
 * wikilinks table powers O(log n) backlink traversal in `query_memory`. The
 * tags table normalizes frontmatter `tags` arrays for tag-filter queries.
 */

function freshDb() {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  return db
}

function tableExists(db: Database.Database, name: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name) as { name: string } | undefined
  return !!row
}

function indexExists(db: Database.Database, name: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?").get(name) as { name: string } | undefined
  return !!row
}

describe('v2a memory aux tables — schema', () => {
  afterEach(() => closeDb())

  it('creates memory_recall_events table with the §3.3 DDL', () => {
    const db = freshDb()
    expect(tableExists(db, 'memory_recall_events')).toBe(true)
    const cols = (db.prepare('PRAGMA table_info(memory_recall_events)').all() as { name: string; notnull: number; type: string }[])
    const colByName = new Map(cols.map(c => [c.name, c]))
    for (const col of ['id', 'memory_id', 'query', 'score', 'rank', 'caller_run_id', 'caller_role', 'source', 'created_at']) {
      expect(colByName.has(col), `memory_recall_events.${col} missing`).toBe(true)
    }
    // NOT NULL invariants for id/memory_id/query/score/rank/source/created_at
    for (const col of ['memory_id', 'query', 'score', 'rank', 'source', 'created_at']) {
      expect(colByName.get(col)?.notnull, `memory_recall_events.${col} should be NOT NULL`).toBe(1)
    }
  })

  it('creates idx_recall_events_memory and idx_recall_events_query', () => {
    const db = freshDb()
    expect(indexExists(db, 'idx_recall_events_memory')).toBe(true)
    expect(indexExists(db, 'idx_recall_events_query')).toBe(true)
  })

  it('inserts and reads back a recall event row', () => {
    const db = freshDb()
    db.prepare(`INSERT INTO memory_recall_events (memory_id, query, score, rank, caller_run_id, caller_role, source, created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run('mem_1', 'what is foo', 0.83, 1, 'run_x', 'software_engineer', 'recall_memory', 1713312000000)
    const row = db.prepare('SELECT memory_id, query, score, rank, source FROM memory_recall_events WHERE memory_id=?').get('mem_1') as { memory_id: string; query: string; score: number; rank: number; source: string }
    expect(row).toBeDefined()
    expect(row.score).toBeCloseTo(0.83, 5)
    expect(row.source).toBe('recall_memory')
  })

  it('creates memory_wikilinks table with PK (src_memory_id, dst_slug)', () => {
    const db = freshDb()
    expect(tableExists(db, 'memory_wikilinks')).toBe(true)
    const cols = (db.prepare('PRAGMA table_info(memory_wikilinks)').all() as { name: string; pk: number }[])
    const colByName = new Map(cols.map(c => [c.name, c]))
    expect(colByName.has('src_memory_id')).toBe(true)
    expect(colByName.has('dst_slug')).toBe(true)
    expect(colByName.has('dst_memory_id')).toBe(true)
    // Composite PK
    expect(colByName.get('src_memory_id')?.pk).toBeGreaterThan(0)
    expect(colByName.get('dst_slug')?.pk).toBeGreaterThan(0)
  })

  it('creates idx_wikilinks_dst and idx_wikilinks_dst_id', () => {
    const db = freshDb()
    expect(indexExists(db, 'idx_wikilinks_dst')).toBe(true)
    expect(indexExists(db, 'idx_wikilinks_dst_id')).toBe(true)
  })

  it('rejects duplicate (src_memory_id, dst_slug) wikilinks', () => {
    const db = freshDb()
    db.prepare('INSERT INTO memory_wikilinks (src_memory_id, dst_slug, dst_memory_id) VALUES (?,?,?)').run('mem_a', 'foo', 'mem_b')
    expect(() => db.prepare('INSERT INTO memory_wikilinks (src_memory_id, dst_slug, dst_memory_id) VALUES (?,?,?)').run('mem_a', 'foo', 'mem_c')).toThrow()
  })

  it('allows dangling links — dst_memory_id NULL is first-class', () => {
    const db = freshDb()
    expect(() => db.prepare('INSERT INTO memory_wikilinks (src_memory_id, dst_slug, dst_memory_id) VALUES (?,?,?)').run('mem_a', 'unresolved-target', null)).not.toThrow()
  })

  it('creates memory_tags table with composite PK (memory_id, tag)', () => {
    const db = freshDb()
    expect(tableExists(db, 'memory_tags')).toBe(true)
    const cols = (db.prepare('PRAGMA table_info(memory_tags)').all() as { name: string; pk: number }[])
    const colByName = new Map(cols.map(c => [c.name, c]))
    expect(colByName.has('memory_id')).toBe(true)
    expect(colByName.has('tag')).toBe(true)
    expect(colByName.get('memory_id')?.pk).toBeGreaterThan(0)
    expect(colByName.get('tag')?.pk).toBeGreaterThan(0)
  })

  it('creates idx_tags_tag', () => {
    const db = freshDb()
    expect(indexExists(db, 'idx_tags_tag')).toBe(true)
  })

  it('rejects duplicate (memory_id, tag) rows', () => {
    const db = freshDb()
    db.prepare('INSERT INTO memory_tags (memory_id, tag) VALUES (?,?)').run('mem_a', 'architecture')
    expect(() => db.prepare('INSERT INTO memory_tags (memory_id, tag) VALUES (?,?)').run('mem_a', 'architecture')).toThrow()
  })
})
