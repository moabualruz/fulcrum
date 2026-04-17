import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { closeDb, _configureDb } from '../db/client.js'
import { runMigrations } from '../db/migrations.js'

/**
 * v2a PR 1 Task 1 — memories table rebuild.
 *
 * Asserts that after schema-init, the memories table has:
 *   - all v2a columns present (tier, slug, vault_path, provenance, supersedes,
 *     recall_count, unique_query_count, max_recall_score, last_recalled_at,
 *     embedded, schema_version, normalize_version, expires_at)
 *   - NO CHECK constraint on `kind` (validation moves to packages/memory/src/write.ts in Task 9)
 *   - slug NOT NULL UNIQUE
 *   - vault_path NOT NULL
 *
 * For existing DBs with the legacy memories shape, the rebuild path migrates
 * rows in-place: synthesized slug = memory_id, synthesized vault_path =
 * 'legacy/' || memory_id || '.md'.
 */

function freshDb() {
  const db = new Database(':memory:')
  _configureDb(db)
  return db
}

function memoryColumns(db: Database.Database) {
  return (db.prepare('PRAGMA table_info(memories)').all() as { name: string; notnull: number; dflt_value: unknown }[])
}

describe('v2a memories rebuild — fresh DB', () => {
  afterEach(() => closeDb())

  it('adds tier column with NOT NULL default short_term', () => {
    const db = freshDb()
    runMigrations(db)
    const cols = memoryColumns(db)
    const tier = cols.find(c => c.name === 'tier')
    expect(tier, 'memories.tier missing').toBeDefined()
    expect(tier!.notnull).toBe(1)
    expect(String(tier!.dflt_value)).toContain('short_term')
  })

  it('adds slug, vault_path, provenance, supersedes, embedded columns', () => {
    const db = freshDb()
    runMigrations(db)
    const cols = memoryColumns(db).map(c => c.name)
    for (const col of ['slug', 'vault_path', 'provenance', 'supersedes', 'embedded']) {
      expect(cols, `memories.${col} missing`).toContain(col)
    }
  })

  it('adds recall counters and last_recalled_at', () => {
    const db = freshDb()
    runMigrations(db)
    const cols = memoryColumns(db).map(c => c.name)
    for (const col of ['recall_count', 'unique_query_count', 'max_recall_score', 'last_recalled_at']) {
      expect(cols, `memories.${col} missing`).toContain(col)
    }
  })

  it('adds versioning + lifecycle columns (schema_version, normalize_version, expires_at)', () => {
    const db = freshDb()
    runMigrations(db)
    const cols = memoryColumns(db).map(c => c.name)
    for (const col of ['schema_version', 'normalize_version', 'expires_at']) {
      expect(cols, `memories.${col} missing`).toContain(col)
    }
  })

  it('memories.slug is NOT NULL and UNIQUE', () => {
    const db = freshDb()
    runMigrations(db)
    const cols = memoryColumns(db)
    const slug = cols.find(c => c.name === 'slug')
    expect(slug?.notnull).toBe(1)
    const indexes = db.prepare('PRAGMA index_list(memories)').all() as { name: string; unique: number }[]
    const slugIndexes = indexes.filter(i => i.unique === 1)
    let foundSlugUnique = false
    for (const idx of slugIndexes) {
      const cols = db.prepare(`PRAGMA index_info(${idx.name})`).all() as { name: string }[]
      if (cols.length === 1 && cols[0]!.name === 'slug') foundSlugUnique = true
    }
    expect(foundSlugUnique, 'no UNIQUE index on memories.slug found').toBe(true)
  })

  it('memories.vault_path is NOT NULL', () => {
    const db = freshDb()
    runMigrations(db)
    const cols = memoryColumns(db)
    const vp = cols.find(c => c.name === 'vault_path')
    expect(vp?.notnull).toBe(1)
  })

  it('drops the kind CHECK constraint — accepts arbitrary kind at DB level', () => {
    const db = freshDb()
    runMigrations(db)
    db.prepare("INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1','w','active','2026-04-17T00:00:00Z')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_1','ws_1','p','git','active','worktree','2026-04-17T00:00:00Z')").run()

    // After Task 1, kind validation moves out of the DB; arbitrary kind values must be accepted.
    expect(() => db.prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, kind, scope, content, slug, vault_path, created_at, updated_at, last_accessed_at)
      VALUES ('mem_arbitrary', 'ws_1', 'proj_1', 'completely_made_up', 'project', 'x', 'mem_arbitrary', 'legacy/mem_arbitrary.md', '2026-04-17T00:00:00Z', '2026-04-17T00:00:00Z', '2026-04-17T00:00:00Z')
    `).run()).not.toThrow()
  })
})

describe('v2a memories rebuild — existing DB with legacy shape', () => {
  afterEach(() => closeDb())

  it('rebuilds an existing legacy memories table and synthesizes slug + vault_path', () => {
    const db = freshDb()

    // Seed a legacy-shape memories table (no tier/slug/vault_path columns).
    db.exec(`
      CREATE TABLE workspaces (workspace_id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE projects (project_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, project_type TEXT, root_path TEXT, default_branch TEXT, parent_project_id TEXT, write_mode TEXT NOT NULL DEFAULT 'worktree', status TEXT NOT NULL DEFAULT 'active', type TEXT NOT NULL DEFAULT 'git', git_url TEXT, description TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE memories (
        memory_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
        project_id TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
        scope TEXT NOT NULL DEFAULT 'project' CHECK(scope IN ('global','project','file','task')),
        kind TEXT NOT NULL DEFAULT 'fact' CHECK(kind IN ('fact','summary','symbol','decision','procedure','error','diff','doc','code','task_goal','task_decision','task_failure','task_outcome','tool_trace','reasoning_step','lesson')),
        title TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        canonical_text TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        entities TEXT NOT NULL DEFAULT '[]',
        confidence REAL NOT NULL DEFAULT 1.0,
        importance REAL NOT NULL DEFAULT 0.5,
        freshness REAL NOT NULL DEFAULT 1.0,
        file_path TEXT,
        symbol_path TEXT,
        event_time TEXT,
        content_hash TEXT,
        task_id TEXT,
        issue_id TEXT,
        artifact_id TEXT,
        provenance_refs TEXT NOT NULL DEFAULT '[]',
        session_id TEXT,
        content_type TEXT NOT NULL DEFAULT 'text',
        sparse_vector TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        embedding BLOB,
        access_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_accessed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)

    db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_legacy','legacy')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_legacy','ws_legacy','legacy_proj')").run()
    db.prepare(`INSERT INTO memories (memory_id, workspace_id, project_id, kind, scope, content, created_at, updated_at, last_accessed_at)
                VALUES ('mem_old_a', 'ws_legacy', 'proj_legacy', 'decision', 'project', 'old A', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`).run()
    db.prepare(`INSERT INTO memories (memory_id, workspace_id, project_id, kind, scope, content, created_at, updated_at, last_accessed_at)
                VALUES ('mem_old_b', 'ws_legacy', 'proj_legacy', 'fact', 'project', 'old B', '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z')`).run()

    // Now apply the v2a schema. The rebuild path must detect the legacy shape and migrate.
    runMigrations(db)

    // Existing rows preserved with synthesized slug + vault_path.
    const rows = db.prepare('SELECT memory_id, slug, vault_path, content FROM memories ORDER BY memory_id').all() as { memory_id: string; slug: string; vault_path: string; content: string }[]
    expect(rows).toHaveLength(2)
    expect(rows[0]!.slug).toBe('mem_old_a')
    expect(rows[0]!.vault_path).toBe('legacy/mem_old_a.md')
    expect(rows[0]!.content).toBe('old A')
    expect(rows[1]!.slug).toBe('mem_old_b')
    expect(rows[1]!.vault_path).toBe('legacy/mem_old_b.md')

    // New columns are present.
    const cols = memoryColumns(db).map(c => c.name)
    expect(cols).toContain('tier')
    expect(cols).toContain('embedded')
    expect(cols).toContain('expires_at')
  })

  it('rebuild is idempotent (running runMigrations twice on already-rebuilt table is safe)', () => {
    const db = freshDb()
    expect(() => runMigrations(db)).not.toThrow()
    expect(() => runMigrations(db)).not.toThrow()
    const cols = memoryColumns(db).map(c => c.name)
    expect(cols).toContain('slug')
    expect(cols).toContain('vault_path')
  })
})

describe('v2a Task 2 — memories.scope CHECK widened', () => {
  afterEach(() => closeDb())

  function seed(db: Database.Database) {
    db.prepare("INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1','w','active','2026-04-17T00:00:00Z')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_1','ws_1','p','git','active','worktree','2026-04-17T00:00:00Z')").run()
  }

  it('accepts session and workspace scopes (v2a additions)', () => {
    const db = freshDb()
    runMigrations(db)
    seed(db)
    for (const sc of ['session', 'workspace']) {
      expect(() => db.prepare(`
        INSERT INTO memories (memory_id, workspace_id, project_id, kind, scope, content, slug, vault_path, created_at, updated_at, last_accessed_at)
        VALUES (?, 'ws_1', 'proj_1', 'fact', ?, 'x', ?, ?, '2026-04-17T00:00:00Z', '2026-04-17T00:00:00Z', '2026-04-17T00:00:00Z')
      `).run(`mem_${sc}`, sc, `mem_${sc}`, `legacy/mem_${sc}.md`)).not.toThrow()
    }
  })

  it('still accepts legacy file and task scopes (transition superset; tightened in PR 6)', () => {
    const db = freshDb()
    runMigrations(db)
    seed(db)
    for (const sc of ['file', 'task']) {
      expect(() => db.prepare(`
        INSERT INTO memories (memory_id, workspace_id, project_id, kind, scope, content, slug, vault_path, created_at, updated_at, last_accessed_at)
        VALUES (?, 'ws_1', 'proj_1', 'fact', ?, 'x', ?, ?, '2026-04-17T00:00:00Z', '2026-04-17T00:00:00Z', '2026-04-17T00:00:00Z')
      `).run(`mem_legacy_${sc}`, sc, `mem_legacy_${sc}`, `legacy/mem_legacy_${sc}.md`)).not.toThrow()
    }
  })

  it('rejects scopes outside the v2a transition superset', () => {
    const db = freshDb()
    runMigrations(db)
    seed(db)
    expect(() => db.prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, kind, scope, content, slug, vault_path, created_at, updated_at, last_accessed_at)
      VALUES ('mem_bogus', 'ws_1', 'proj_1', 'fact', 'galactic', 'x', 'mem_bogus', 'legacy/mem_bogus.md', '2026-04-17T00:00:00Z', '2026-04-17T00:00:00Z', '2026-04-17T00:00:00Z')
    `).run()).toThrow()
  })
})
