// packages/memory/src/tests/schema-v3.test.ts
//
// Memory v3 PR 0 unit 0.2 — migration 101_memory_v3_lifecycle.
// Asserts the post-migration shape matches docs/plans/2026-04-18-002-memory-tiered-architecture-plan.md §Knowledge graph + §Unit 0.2.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { runMigration101MemoryV3Lifecycle, runMigration102MemoryV3SourceIndex } from '../schema.js'

function columnNames(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(c => c.name)
}

function columnInfo(db: Database.Database, table: string) {
  return db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string
    type: string
    notnull: number
    dflt_value: unknown
  }[]
}

beforeEach(() => { createTestDb() })
afterEach(() => resetTestDb())

describe('runMigration101MemoryV3Lifecycle — memories extension', () => {
  it('adds retention_tier, confidence_decay_at, superseded_by, consolidated_from_ids columns (all nullable)', () => {
    const db = getDb()
    runMigration101MemoryV3Lifecycle(db)
    const cols = columnInfo(db, 'memories')
    for (const name of ['retention_tier', 'confidence_decay_at', 'superseded_by', 'consolidated_from_ids']) {
      const col = cols.find(c => c.name === name)
      expect(col, `memories.${name} missing`).toBeDefined()
      expect(col!.notnull, `memories.${name} should be nullable pre-cutover`).toBe(0)
      expect(col!.type.toUpperCase()).toBe('TEXT')
    }
  })
})

describe('runMigration101MemoryV3Lifecycle — graph_entities extension', () => {
  it('adds aliases, confidence, first_seen, last_confirmed columns', () => {
    const db = getDb()
    runMigration101MemoryV3Lifecycle(db)
    const cols = columnInfo(db, 'graph_entities')
    const aliases = cols.find(c => c.name === 'aliases')
    expect(aliases?.type.toUpperCase()).toBe('TEXT')
    expect(aliases?.notnull).toBe(0)

    const confidence = cols.find(c => c.name === 'confidence')
    expect(confidence?.type.toUpperCase()).toBe('REAL')
    expect(confidence?.notnull).toBe(1)
    expect(String(confidence?.dflt_value)).toBe('1.0')

    for (const name of ['first_seen', 'last_confirmed']) {
      const col = cols.find(c => c.name === name)
      expect(col, `graph_entities.${name} missing`).toBeDefined()
      expect(col!.type.toUpperCase()).toBe('TEXT')
      expect(col!.notnull).toBe(0)
    }
  })

  it('preserves existing columns (workspace_id, entity_type, properties, valid_from/until, updated_at)', () => {
    const db = getDb()
    runMigration101MemoryV3Lifecycle(db)
    const cols = columnNames(db, 'graph_entities')
    for (const name of ['entity_id', 'workspace_id', 'name', 'entity_type', 'properties', 'valid_from', 'valid_until', 'created_at', 'updated_at']) {
      expect(cols, `graph_entities.${name} dropped`).toContain(name)
    }
  })
})

describe('runMigration101MemoryV3Lifecycle — graph_edges extension', () => {
  it('adds confidence and source_ids columns (weight preserved)', () => {
    const db = getDb()
    runMigration101MemoryV3Lifecycle(db)
    const cols = columnInfo(db, 'graph_edges')

    const confidence = cols.find(c => c.name === 'confidence')
    expect(confidence?.type.toUpperCase()).toBe('REAL')
    expect(confidence?.notnull).toBe(1)
    expect(String(confidence?.dflt_value)).toBe('1.0')

    const sourceIds = cols.find(c => c.name === 'source_ids')
    expect(sourceIds?.type.toUpperCase()).toBe('TEXT')
    expect(sourceIds?.notnull).toBe(0)

    // Legacy weight column must remain for back-compat
    const weight = cols.find(c => c.name === 'weight')
    expect(weight?.type.toUpperCase()).toBe('REAL')
  })
})

describe('runMigration101MemoryV3Lifecycle — l0_sources table', () => {
  it('creates l0_sources table with the expected shape', () => {
    const db = getDb()
    runMigration101MemoryV3Lifecycle(db)

    const tbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='l0_sources'").get()
    expect(tbl).toBeDefined()

    const cols = columnInfo(db, 'l0_sources')
    const byName = Object.fromEntries(cols.map(c => [c.name, c]))

    expect(byName.source_id?.type.toUpperCase()).toBe('TEXT')
    expect(byName.source_type?.notnull).toBe(1)
    expect(byName.session_id?.notnull).toBe(0)
    expect(byName.workspace_id?.notnull).toBe(1)
    expect(byName.project_id?.notnull).toBe(0)
    expect(byName.vault_path?.notnull).toBe(1)
    expect(byName.content_hash?.notnull).toBe(1)
    expect(byName.size_bytes?.type.toUpperCase()).toBe('INTEGER')
    expect(byName.size_bytes?.notnull).toBe(1)
    expect(byName.created_at?.notnull).toBe(1)

    // Primary key: source_id
    const pkCol = cols.find(c => c.name === 'source_id') as { pk?: number } | undefined
    expect(pkCol).toBeDefined()
  })

  it('l0_sources accepts a well-formed row and cascades on workspace delete', () => {
    const db = getDb()
    runMigration101MemoryV3Lifecycle(db)
    seedWorkspaceAndProject(db, 'ws_l0', 'proj_l0')

    db.prepare(`
      INSERT INTO l0_sources (source_id, source_type, workspace_id, project_id, vault_path, content_hash, size_bytes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('01SRC_A', 'bash_trace', 'ws_l0', 'proj_l0', 'raw/bash_trace/2026/04/18/01SRC_A.md', 'abc123', 42, '2026-04-18T00:00:00Z')

    const row = db.prepare("SELECT source_id, workspace_id FROM l0_sources WHERE source_id = '01SRC_A'").get() as { source_id: string; workspace_id: string } | undefined
    expect(row?.workspace_id).toBe('ws_l0')

    db.prepare("DELETE FROM workspaces WHERE workspace_id = 'ws_l0'").run()
    const after = db.prepare("SELECT COUNT(*) AS n FROM l0_sources WHERE workspace_id = 'ws_l0'").get() as { n: number }
    expect(after.n, 'workspace cascade did not propagate to l0_sources').toBe(0)
  })
})

describe('runMigration101MemoryV3Lifecycle — l1_pages view', () => {
  it('creates l1_pages as a view (not a table)', () => {
    const db = getDb()
    runMigration101MemoryV3Lifecycle(db)
    const row = db.prepare("SELECT type FROM sqlite_master WHERE name='l1_pages'").get() as { type: string } | undefined
    expect(row?.type).toBe('view')
  })

  it('view filters to memories rows with schema_version >= 3', () => {
    const db = getDb()
    runMigration101MemoryV3Lifecycle(db)
    seedWorkspaceAndProject(db, 'ws_v', 'proj_v')

    // v2a row (schema_version defaults to 1) — must NOT appear in view
    db.prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, kind, scope, content, slug, vault_path, created_at, updated_at, last_accessed_at)
      VALUES ('mem_v2', 'ws_v', 'proj_v', 'fact', 'project', 'old', 'mem_v2', 'legacy/mem_v2.md', '2026-04-18T00:00:00Z', '2026-04-18T00:00:00Z', '2026-04-18T00:00:00Z')
    `).run()

    // v3 row (schema_version = 3) — must appear
    db.prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, kind, scope, content, slug, vault_path, schema_version, retention_tier, created_at, updated_at, last_accessed_at)
      VALUES ('mem_v3', 'ws_v', 'proj_v', 'page', 'project', 'curated body', 'mem_v3', 'curated/pages/mem_v3.md', 3, 'working', '2026-04-18T00:00:00Z', '2026-04-18T00:00:00Z', '2026-04-18T00:00:00Z')
    `).run()

    const rows = db.prepare('SELECT page_id, page_type, body, retention_tier FROM l1_pages ORDER BY page_id').all() as { page_id: string; page_type: string; body: string; retention_tier: string | null }[]
    expect(rows).toHaveLength(1)
    expect(rows[0]!.page_id).toBe('mem_v3')
    expect(rows[0]!.page_type).toBe('page')
    expect(rows[0]!.body).toBe('curated body')
    expect(rows[0]!.retention_tier).toBe('working')
  })
})

describe('runMigration101MemoryV3Lifecycle — ledger + idempotency', () => {
  it('records 101_memory_v3_lifecycle in schema_migrations', () => {
    const db = getDb()
    runMigration101MemoryV3Lifecycle(db)
    const row = db.prepare("SELECT name FROM schema_migrations WHERE name = '101_memory_v3_lifecycle'").get() as { name: string } | undefined
    expect(row?.name).toBe('101_memory_v3_lifecycle')
  })

  it('is idempotent — running twice does not throw and does not duplicate ledger rows', () => {
    const db = getDb()
    expect(() => runMigration101MemoryV3Lifecycle(db)).not.toThrow()
    expect(() => runMigration101MemoryV3Lifecycle(db)).not.toThrow()

    const count = db.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE name = '101_memory_v3_lifecycle'").get() as { n: number }
    expect(count.n).toBe(1)

    // Columns still present, view still resolves
    expect(columnNames(db, 'memories')).toContain('retention_tier')
    const view = db.prepare("SELECT type FROM sqlite_master WHERE name='l1_pages'").get() as { type: string } | undefined
    expect(view?.type).toBe('view')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// unit 0.3 — runMigration102MemoryV3SourceIndex
// ─────────────────────────────────────────────────────────────────────────────

function indexSql(db: Database.Database, name: string): string | undefined {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name = ?").get(name) as { sql: string | null } | undefined
  return row?.sql ?? undefined
}

describe('runMigration102MemoryV3SourceIndex — l0_sources indexes', () => {
  it('creates the five expected indexes on l0_sources', () => {
    const db = getDb()
    runMigration101MemoryV3Lifecycle(db)
    runMigration102MemoryV3SourceIndex(db)

    expect(indexSql(db, 'idx_l0_sources_ws_project')).toMatch(/l0_sources.*workspace_id.*project_id/is)
    expect(indexSql(db, 'idx_l0_sources_type')).toMatch(/l0_sources.*source_type/is)
    expect(indexSql(db, 'idx_l0_sources_hash')).toMatch(/l0_sources.*content_hash/is)
    expect(indexSql(db, 'idx_l0_sources_created')).toMatch(/l0_sources.*created_at/is)

    const sessionSql = indexSql(db, 'idx_l0_sources_session')
    expect(sessionSql).toMatch(/l0_sources.*session_id/is)
    expect(sessionSql, 'session index must be partial').toMatch(/WHERE\s+session_id\s+IS\s+NOT\s+NULL/i)
  })
})

describe('runMigration102MemoryV3SourceIndex — memories indexes are partial', () => {
  it('three partial indexes guard against sparse v3 columns', () => {
    const db = getDb()
    runMigration101MemoryV3Lifecycle(db)
    runMigration102MemoryV3SourceIndex(db)

    for (const [name, col] of [
      ['idx_memories_retention_tier', 'retention_tier'],
      ['idx_memories_superseded_by', 'superseded_by'],
      ['idx_memories_decay', 'confidence_decay_at'],
    ] as const) {
      const sql = indexSql(db, name)
      expect(sql, `${name} missing`).toBeDefined()
      expect(sql).toMatch(new RegExp(`memories.*${col}`, 'is'))
      expect(sql, `${name} must be partial`).toMatch(new RegExp(`WHERE\\s+${col}\\s+IS\\s+NOT\\s+NULL`, 'i'))
    }
  })
})

describe('runMigration102MemoryV3SourceIndex — graph indexes', () => {
  it('creates confidence + last_confirmed indexes on graph_entities and confidence on graph_edges', () => {
    const db = getDb()
    runMigration101MemoryV3Lifecycle(db)
    runMigration102MemoryV3SourceIndex(db)

    expect(indexSql(db, 'idx_graph_entities_confidence')).toMatch(/graph_entities.*confidence/is)
    expect(indexSql(db, 'idx_graph_edges_confidence')).toMatch(/graph_edges.*confidence/is)

    const lastConfirmed = indexSql(db, 'idx_graph_entities_last_confirmed')
    expect(lastConfirmed).toMatch(/graph_entities.*last_confirmed/is)
    expect(lastConfirmed, 'last_confirmed index must be partial').toMatch(/WHERE\s+last_confirmed\s+IS\s+NOT\s+NULL/i)
  })
})

describe('runMigration102MemoryV3SourceIndex — ledger + idempotency', () => {
  it('records 102_memory_v3_source_index in schema_migrations', () => {
    const db = getDb()
    runMigration101MemoryV3Lifecycle(db)
    runMigration102MemoryV3SourceIndex(db)
    const row = db.prepare("SELECT name FROM schema_migrations WHERE name = '102_memory_v3_source_index'").get() as { name: string } | undefined
    expect(row?.name).toBe('102_memory_v3_source_index')
  })

  it('is idempotent — safe to re-run, no duplicate ledger rows', () => {
    const db = getDb()
    runMigration101MemoryV3Lifecycle(db)
    expect(() => runMigration102MemoryV3SourceIndex(db)).not.toThrow()
    expect(() => runMigration102MemoryV3SourceIndex(db)).not.toThrow()

    const count = db.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE name = '102_memory_v3_source_index'").get() as { n: number }
    expect(count.n).toBe(1)

    // All 10 v3 indexes still present
    const names = ['idx_l0_sources_ws_project','idx_l0_sources_type','idx_l0_sources_session','idx_l0_sources_hash','idx_l0_sources_created','idx_memories_retention_tier','idx_memories_superseded_by','idx_memories_decay','idx_graph_entities_confidence','idx_graph_entities_last_confirmed','idx_graph_edges_confidence']
    for (const n of names) expect(indexSql(db, n), `${n} missing after re-run`).toBeDefined()
  })
})
