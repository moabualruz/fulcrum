// packages/memory/src/tests/schema-v3-cutover.test.ts
//
// Memory v3 PR 6 unit 6.4 — runMigration103MemoryV3Cutover.
//
// Table-rebuild dance that flips retention_tier + confidence_decay_at to
// NOT NULL. Relies on 6.3 having cleared the pre-v3 L0-class rows (which
// have NULL retention_tier); if any remain the rebuild refuses to populate
// the new table with NULLs. Idempotent via ledger + PRAGMA column check.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDb, newId } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import {
  runMigration101MemoryV3Lifecycle,
  runMigration102MemoryV3SourceIndex,
  runMigration103MemoryV3Cutover,
} from '../schema.js'

function seedV3Page(id: string, kind = 'decision'): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO memories(
      memory_id, workspace_id, project_id, scope, kind, title, summary, content,
      schema_version, retention_tier, confidence_decay_at, vault_path, provenance
    ) VALUES (?, 'ws_mig', 'proj_mig', 'project', ?, '', '', 'body',
              3, 'working', datetime('now'), ?, '{"sources":[]}')
  `).run(id, kind, `curated/pages/${id}.md`)
}

function columnIsNotNull(db: any, table: string, col: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; notnull: number }[]
  const row = rows.find(r => r.name === col)
  return !!row && row.notnull === 1
}

beforeEach(() => {
  createTestDb()
  runMigration101MemoryV3Lifecycle(getDb())
  runMigration102MemoryV3SourceIndex(getDb())
  seedWorkspaceAndProject(getDb(), 'ws_mig', 'proj_mig')
})

afterEach(() => {
  resetTestDb()
})

describe('runMigration103MemoryV3Cutover — NOT NULL flip', () => {
  it('flips retention_tier to NOT NULL post-cutover', () => {
    expect(columnIsNotNull(getDb(), 'memories', 'retention_tier')).toBe(false)
    runMigration103MemoryV3Cutover(getDb())
    expect(columnIsNotNull(getDb(), 'memories', 'retention_tier')).toBe(true)
  })

  it('flips confidence_decay_at to NOT NULL post-cutover', () => {
    runMigration103MemoryV3Cutover(getDb())
    expect(columnIsNotNull(getDb(), 'memories', 'confidence_decay_at')).toBe(true)
  })

  it('writes the 103_memory_v3_cutover ledger row', () => {
    runMigration103MemoryV3Cutover(getDb())
    const row = getDb().prepare(`SELECT name FROM schema_migrations WHERE name = ?`).get('103_memory_v3_cutover') as { name: string } | undefined
    expect(row?.name).toBe('103_memory_v3_cutover')
  })

  it('is idempotent — a second call is a no-op', () => {
    runMigration103MemoryV3Cutover(getDb())
    // Should not throw or change state on re-run.
    expect(() => runMigration103MemoryV3Cutover(getDb())).not.toThrow()
    expect(columnIsNotNull(getDb(), 'memories', 'retention_tier')).toBe(true)
  })
})

describe('runMigration103MemoryV3Cutover — row preservation', () => {
  it('preserves every memories row through the rebuild', () => {
    const a = newId('memory')
    const b = newId('memory')
    seedV3Page(a, 'decision')
    seedV3Page(b, 'fact')

    const before = getDb().prepare('SELECT COUNT(*) AS n FROM memories').get() as { n: number }
    runMigration103MemoryV3Cutover(getDb())
    const after = getDb().prepare('SELECT COUNT(*) AS n FROM memories').get() as { n: number }

    expect(after.n).toBe(before.n)
    expect(getDb().prepare('SELECT kind FROM memories WHERE memory_id = ?').get(a)).toEqual({ kind: 'decision' })
    expect(getDb().prepare('SELECT kind FROM memories WHERE memory_id = ?').get(b)).toEqual({ kind: 'fact' })
  })

  it('preserves values for every v3 lifecycle column', () => {
    const id = newId('memory')
    seedV3Page(id, 'decision')
    runMigration103MemoryV3Cutover(getDb())
    const row = getDb().prepare(`
      SELECT retention_tier, confidence_decay_at, superseded_by, consolidated_from_ids, schema_version, vault_path, provenance
      FROM memories WHERE memory_id = ?
    `).get(id) as any
    expect(row.retention_tier).toBe('working')
    expect(row.confidence_decay_at).toBeTruthy()
    expect(row.superseded_by).toBeNull()
    expect(row.consolidated_from_ids).toBeNull()
    expect(row.schema_version).toBe(3)
    expect(row.vault_path).toBe(`curated/pages/${id}.md`)
    expect(JSON.parse(row.provenance).sources).toEqual([])
  })
})

describe('runMigration103MemoryV3Cutover — fails on NULL lifecycle rows', () => {
  it('throws if any memories row has NULL retention_tier', () => {
    // Seed a pre-v3 row with NULL retention_tier (simulates 6.3 NOT having
    // run for that row — e.g. an unknown-kind row that never got migrated).
    const id = newId('memory')
    getDb().prepare(`
      INSERT INTO memories(memory_id, workspace_id, project_id, scope, kind, title, summary, content)
      VALUES(?, 'ws_mig', 'proj_mig', 'project', 'entity', '', '', 'x')
    `).run(id)

    expect(() => runMigration103MemoryV3Cutover(getDb())).toThrowError(/NOT NULL|retention_tier/i)
    // Ledger row NOT written on failure.
    const row = getDb().prepare(`SELECT name FROM schema_migrations WHERE name = ?`).get('103_memory_v3_cutover')
    expect(row).toBeUndefined()
    // Original table survives (transaction rollback).
    expect(columnIsNotNull(getDb(), 'memories', 'retention_tier')).toBe(false)
  })
})

describe('runMigration103MemoryV3Cutover — schema companions', () => {
  it('l1_pages view still works post-cutover', () => {
    const id = newId('memory')
    seedV3Page(id, 'decision')
    runMigration103MemoryV3Cutover(getDb())
    const hit = getDb().prepare('SELECT page_id FROM l1_pages WHERE page_id = ?').get(id) as { page_id: string } | undefined
    expect(hit?.page_id).toBe(id)
  })

  it('FTS5 triggers still fire (insert → memories_fts searchable)', () => {
    runMigration103MemoryV3Cutover(getDb())
    const id = newId('memory')
    seedV3Page(id, 'decision')
    getDb().prepare('UPDATE memories SET content = ? WHERE memory_id = ?').run('cutovertoken', id)
    const hit = getDb().prepare(`SELECT rowid FROM memories_fts WHERE memories_fts MATCH ?`).get('cutovertoken')
    expect(hit).toBeTruthy()
  })

  it('indexes added by 101/102 survive the rebuild', () => {
    runMigration103MemoryV3Cutover(getDb())
    const names = (getDb().prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='memories'`).all() as { name: string }[]).map(r => r.name)
    expect(names).toContain('idx_memories_retention_tier')
    expect(names).toContain('idx_memories_superseded_by')
    expect(names).toContain('idx_memories_decay')
  })
})
