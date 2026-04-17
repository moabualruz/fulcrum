import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { closeDb, _configureDb } from '../db/client.js'
import { runMigrations } from '../db/migrations.js'

/**
 * v2a PR 1 Task 6 — projects.root_realpath (UNIQUE) + projects.vcs_remote.
 *
 * Plan §3.3d wants root_realpath TEXT NOT NULL UNIQUE so a project move on
 * disk updates one row and every code_files.rel_path stays valid. The existing
 * projects table already has nullable root_path; root_realpath is the symlink-
 * resolved canonical sibling.
 *
 * v2a PR 1 ships the column nullable + a partial UNIQUE INDEX so existing
 * INSERT sites keep working without a forced NOT NULL retrofit. PR 4's PCI
 * watcher populates root_realpath at watch-init time (via fs.realpath) and
 * v2b's project-move action enforces single-row updates. The strict NOT NULL
 * lands when those callers are consistent (see progress log Task 6 deviation).
 */

function freshDb() {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  return db
}

describe('projects.root_realpath + vcs_remote (v2a Task 6)', () => {
  afterEach(() => closeDb())

  it('projects has root_realpath column (nullable in v2a PR 1)', () => {
    const db = freshDb()
    const cols = db.prepare('PRAGMA table_info(projects)').all() as { name: string; notnull: number }[]
    const rr = cols.find(c => c.name === 'root_realpath')
    expect(rr, 'projects.root_realpath missing').toBeDefined()
    // Nullable until PR 4 + v2b project-move action populate every row.
    expect(rr!.notnull).toBe(0)
  })

  it('projects has vcs_remote column (nullable)', () => {
    const db = freshDb()
    const cols = db.prepare('PRAGMA table_info(projects)').all() as { name: string; notnull: number }[]
    const vr = cols.find(c => c.name === 'vcs_remote')
    expect(vr, 'projects.vcs_remote missing').toBeDefined()
    expect(vr!.notnull).toBe(0)
  })

  it('idx_projects_realpath is a partial UNIQUE index', () => {
    const db = freshDb()
    const indexes = db.prepare('PRAGMA index_list(projects)').all() as { name: string; unique: number; partial: number }[]
    const idx = indexes.find(i => i.name === 'idx_projects_realpath')
    expect(idx, 'idx_projects_realpath missing').toBeDefined()
    expect(idx!.unique).toBe(1)
    expect(idx!.partial).toBe(1) // WHERE root_realpath IS NOT NULL
    const cols = db.prepare(`PRAGMA index_info(idx_projects_realpath)`).all() as { name: string }[]
    expect(cols.map(c => c.name)).toEqual(['root_realpath'])
  })

  it('rejects two projects with the same root_realpath', () => {
    const db = freshDb()
    db.prepare("INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1','w','active','2026-04-17T00:00:00Z')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, root_realpath, created_at) VALUES ('p_a','ws_1','a','git','active','worktree','/srv/repo','2026-04-17T00:00:00Z')").run()
    expect(() => db.prepare("INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, root_realpath, created_at) VALUES ('p_b','ws_1','b','git','active','worktree','/srv/repo','2026-04-17T00:00:00Z')").run()).toThrow()
  })

  it('allows two projects with NULL root_realpath (partial index excludes NULLs)', () => {
    const db = freshDb()
    db.prepare("INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1','w','active','2026-04-17T00:00:00Z')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('p_a','ws_1','a','git','active','worktree','2026-04-17T00:00:00Z')").run()
    expect(() => db.prepare("INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('p_b','ws_1','b','git','active','worktree','2026-04-17T00:00:00Z')").run()).not.toThrow()
  })
})
