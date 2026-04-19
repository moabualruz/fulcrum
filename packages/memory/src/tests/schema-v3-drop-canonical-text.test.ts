// packages/memory/src/tests/schema-v3-drop-canonical-text.test.ts
//
// Memory v3 PR 9 unit 9.3 — runMigration104MemoryV3DropCanonicalText.
//
// Table-rebuild dance that drops the legacy `memories.canonical_text` column
// and rewires the FTS5 virtual table + triggers to index content/title/summary
// only. Parallels the 103 test shape: column transition, ledger, idempotency,
// row preservation, FTS5 still queryable, l1_pages view survives the swap.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDb, newId } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import {
  runMigration101MemoryV3Lifecycle,
  runMigration102MemoryV3SourceIndex,
  runMigration103MemoryV3Cutover,
  runMigration104MemoryV3DropCanonicalText,
} from '../schema.js'

function tableCols(table: string): string[] {
  return (getDb().prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(c => c.name)
}

function ftsCols(): string[] {
  // FTS5 shadow tables expose their column list via sqlite_master.sql — parse
  // the CREATE VIRTUAL TABLE statement's column list (before the option args).
  const row = getDb().prepare(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='memories_fts'`,
  ).get() as { sql: string } | undefined
  if (!row?.sql) return []
  const match = /fts5\s*\(([^)]+)\)/i.exec(row.sql)
  if (!match?.[1]) return []
  return match[1]
    .split(',')
    .map(s => s.trim())
    .filter(s => !s.includes('=') && s.length > 0)
}

function seedV3Page(id: string, content: string): void {
  getDb().prepare(`
    INSERT INTO memories(
      memory_id, workspace_id, project_id, scope, kind, title, summary, content,
      schema_version, retention_tier, confidence_decay_at, vault_path, provenance
    ) VALUES (?, 'ws_104', 'proj_104', 'project', 'decision', '', '', ?,
              3, 'working', datetime('now'), ?, '{"sources":[]}')
  `).run(id, content, `curated/pages/${id}.md`)
}

beforeEach(() => {
  createTestDb()
  seedWorkspaceAndProject(getDb(), 'ws_104', 'proj_104')
  runMigration101MemoryV3Lifecycle(getDb())
  runMigration102MemoryV3SourceIndex(getDb())
  runMigration103MemoryV3Cutover(getDb())
})

afterEach(() => {
  resetTestDb()
})

describe('runMigration104MemoryV3DropCanonicalText — column + ledger + idempotency', () => {
  it('drops canonical_text from memories and memories_fts', () => {
    expect(tableCols('memories')).toContain('canonical_text')
    expect(ftsCols()).toContain('canonical_text')

    runMigration104MemoryV3DropCanonicalText(getDb())

    expect(tableCols('memories')).not.toContain('canonical_text')
    expect(ftsCols()).not.toContain('canonical_text')
    expect(ftsCols().sort()).toEqual(['content', 'summary', 'title'])
  })

  it('writes the 104_memory_v3_drop_canonical_text ledger row', () => {
    runMigration104MemoryV3DropCanonicalText(getDb())
    const row = getDb().prepare(`SELECT name FROM schema_migrations WHERE name = ?`).get('104_memory_v3_drop_canonical_text') as { name: string } | undefined
    expect(row?.name).toBe('104_memory_v3_drop_canonical_text')
  })

  it('is idempotent — a second call is a no-op', () => {
    runMigration104MemoryV3DropCanonicalText(getDb())
    expect(() => runMigration104MemoryV3DropCanonicalText(getDb())).not.toThrow()
    expect(tableCols('memories')).not.toContain('canonical_text')
  })

  it('fast-path when column absent writes ledger row without rebuilding', () => {
    // First call drops the column + writes the ledger row.
    runMigration104MemoryV3DropCanonicalText(getDb())
    const firstRow = getDb().prepare(`SELECT name FROM schema_migrations WHERE name = ?`).get('104_memory_v3_drop_canonical_text') as { name: string } | undefined
    expect(firstRow?.name).toBe('104_memory_v3_drop_canonical_text')
    // Second call short-circuits on the ledger row; no column to drop, no rebuild.
    expect(() => runMigration104MemoryV3DropCanonicalText(getDb())).not.toThrow()
  })
})

describe('runMigration104MemoryV3DropCanonicalText — row preservation + companions', () => {
  it('preserves every memories row through the rebuild', () => {
    const a = newId('memory')
    const b = newId('memory')
    seedV3Page(a, 'alpha rebuild body')
    seedV3Page(b, 'beta rebuild body')

    const before = getDb().prepare('SELECT COUNT(*) AS n FROM memories').get() as { n: number }
    runMigration104MemoryV3DropCanonicalText(getDb())
    const after = getDb().prepare('SELECT COUNT(*) AS n FROM memories').get() as { n: number }

    expect(after.n).toBe(before.n)
    expect(getDb().prepare('SELECT content FROM memories WHERE memory_id = ?').get(a)).toEqual({ content: 'alpha rebuild body' })
    expect(getDb().prepare('SELECT content FROM memories WHERE memory_id = ?').get(b)).toEqual({ content: 'beta rebuild body' })
  })

  it('FTS5 index is queryable after the rebuild (backfilled via rebuild command)', () => {
    const id = newId('memory')
    seedV3Page(id, 'unique104token should be findable')

    runMigration104MemoryV3DropCanonicalText(getDb())

    const hit = getDb().prepare(
      `SELECT rowid FROM memories_fts WHERE memories_fts MATCH ?`,
    ).get('unique104token') as { rowid: number } | undefined
    expect(hit).toBeTruthy()
  })

  it('l1_pages view still resolves post-104', () => {
    const id = newId('memory')
    seedV3Page(id, 'view body')
    runMigration104MemoryV3DropCanonicalText(getDb())
    const hit = getDb().prepare('SELECT page_id FROM l1_pages WHERE page_id = ?').get(id) as { page_id: string } | undefined
    expect(hit?.page_id).toBe(id)
  })

  it('indexes added by 101/102 survive the rebuild', () => {
    runMigration104MemoryV3DropCanonicalText(getDb())
    const names = (getDb().prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='memories'`).all() as { name: string }[]).map(r => r.name)
    expect(names).toContain('idx_memories_retention_tier')
    expect(names).toContain('idx_memories_superseded_by')
    expect(names).toContain('idx_memories_decay')
  })

  it('new writes populate memories_fts without canonical_text reference', () => {
    runMigration104MemoryV3DropCanonicalText(getDb())
    const id = newId('memory')
    seedV3Page(id, 'post104token rides through the recreated triggers')
    const hit = getDb().prepare(
      `SELECT rowid FROM memories_fts WHERE memories_fts MATCH ?`,
    ).get('post104token') as { rowid: number } | undefined
    expect(hit).toBeTruthy()
  })
})
