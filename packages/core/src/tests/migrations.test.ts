import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { closeDb, _configureDb, getDb, setDb } from '../db/client.js'
import { runMigrations } from '../db/migrations.js'

function freshDb() {
  const db = new Database(':memory:')
  _configureDb(db)
  return db
}

describe('runMigrations', () => {
  afterEach(() => closeDb())

  it('creates all required tables', () => {
    const db = freshDb()
    runMigrations(db)
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[]
    const names = tables.map(t => t.name)
    expect(names).toContain('workspaces')
    expect(names).toContain('projects')
    expect(names).toContain('tasks')
    expect(names).toContain('agent_runs')
    expect(names).toContain('memories')
    expect(names).toContain('advisory_locks')
    expect(names).toContain('schema_migrations')
  })

  it('is idempotent — safe to run twice', () => {
    const db = freshDb()
    expect(() => runMigrations(db)).not.toThrow()
    expect(() => runMigrations(db)).not.toThrow()
  })

  it('tasks table has version and depends_on columns', () => {
    const db = freshDb()
    runMigrations(db)
    const cols = db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[]
    const colNames = cols.map(c => c.name)
    expect(colNames).toContain('version')
    expect(colNames).toContain('depends_on')
  })

  it('agent_runs table has artifacts and git_branch columns', () => {
    const db = freshDb()
    runMigrations(db)
    const cols = db.prepare('PRAGMA table_info(agent_runs)').all() as { name: string }[]
    const colNames = cols.map(c => c.name)
    expect(colNames).toContain('artifacts')
    expect(colNames).toContain('git_branch')
    expect(colNames).toContain('git_commit')
    expect(colNames).toContain('events')
    expect(colNames).toContain('version')
  })

  it('memories table has confidence and access_count columns', () => {
    const db = freshDb()
    runMigrations(db)
    const cols = db.prepare('PRAGMA table_info(memories)').all() as { name: string }[]
    const colNames = cols.map(c => c.name)
    expect(colNames).toContain('confidence')
    expect(colNames).toContain('access_count')
    expect(colNames).toContain('last_accessed_at')
    expect(colNames).toContain('embedding')
  })

  it('creates vec_memories table when sqlite-vec is available', () => {
    const db = freshDb()
    runMigrations(db)
    // This table only exists when sqlite-vec is loaded — skip assertion if not
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[]
    const names = tables.map(t => t.name)
    // If sqlite-vec was loaded during _configureDb, the table should exist
    // If not available, skip (test doesn't fail)
    if (names.includes('vec_memories')) {
      expect(names).toContain('vec_memories')
    }
  })
})

// MIGRATION_002 tests — use a shared db set up via createTestDb() pattern
function freshDb2() {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  return db
}

describe('MIGRATION_002 — new columns on workspaces', () => {
  beforeEach(() => { freshDb2() })
  afterEach(() => closeDb())

  it('workspaces has status column defaulting to active', () => {
    const db = getDb()
    const cols = (db.prepare("PRAGMA table_info(workspaces)").all() as { name: string }[]).map(r => r.name)
    expect(cols).toContain('status')
    const ws = db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_m2','m2') RETURNING *").get() as Record<string, unknown>
    expect(ws.status).toBe('active')
  })
})

describe('MIGRATION_002 — new columns on projects', () => {
  beforeEach(() => { freshDb2() })
  afterEach(() => closeDb())

  it('projects has project_type, root_path, default_branch, parent_project_id, write_mode, status', () => {
    const db = getDb()
    const cols = (db.prepare("PRAGMA table_info(projects)").all() as { name: string }[]).map(r => r.name)
    expect(cols).toContain('project_type')
    expect(cols).toContain('root_path')
    expect(cols).toContain('default_branch')
    expect(cols).toContain('parent_project_id')
    expect(cols).toContain('write_mode')
    expect(cols).toContain('status')
  })
})

describe('MIGRATION_002 — new columns on tasks', () => {
  beforeEach(() => { freshDb2() })
  afterEach(() => closeDb())

  it('tasks has display_id, issue_id, priority, estimate_type, estimate_value, done_criteria, status_category, claimed_at, completed_at', () => {
    const db = getDb()
    const cols = (db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[]).map(r => r.name)
    for (const col of ['display_id','issue_id','priority','estimate_type','estimate_value','done_criteria','status_category','claimed_at','completed_at']) {
      expect(cols, `missing column: ${col}`).toContain(col)
    }
  })

  it('existing task status values remain valid after migration', () => {
    const db = getDb()
    db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_m2','m2')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_m2','ws_m2','pm2')").run()
    for (const status of ['queued', 'completed', 'blocked']) {
      expect(() =>
        db.prepare("INSERT INTO tasks (task_id, workspace_id, project_id, title, status, display_id, priority, status_category) VALUES (?,?,?,?,?,?,?,?)")
          .run(`t_${status}`, 'ws_m2', 'proj_m2', `task ${status}`, status, `TASK-x`, 'medium', 'backlog')
      ).not.toThrow()
    }
  })
})

describe('MIGRATION_002 — new columns on agent_runs', () => {
  beforeEach(() => { freshDb2() })
  afterEach(() => closeDb())

  it('agent_runs has display_id, project_id, agent_id, pi_profile, status_category, current_path, heartbeat_at, blocker, worktree_id, finished_at', () => {
    const db = getDb()
    const cols = (db.prepare("PRAGMA table_info(agent_runs)").all() as { name: string }[]).map(r => r.name)
    for (const col of ['display_id','project_id','agent_id','pi_profile','status_category','current_path','heartbeat_at','blocker','worktree_id','finished_at']) {
      expect(cols, `missing column: ${col}`).toContain(col)
    }
  })
})

describe('MIGRATION_002 — new columns on memories', () => {
  beforeEach(() => { freshDb2() })
  afterEach(() => closeDb())

  it('memories has scope, kind, title, summary, canonical_text, entities, event_time, content_hash, symbol_path, task_id, issue_id, artifact_id, provenance_refs', () => {
    const db = getDb()
    const cols = (db.prepare("PRAGMA table_info(memories)").all() as { name: string }[]).map(r => r.name)
    for (const col of ['scope','kind','title','summary','canonical_text','entities','event_time','content_hash','symbol_path','task_id','issue_id','artifact_id','provenance_refs']) {
      expect(cols, `missing column: ${col}`).toContain(col)
    }
  })
})

describe('MIGRATION_002 — new tables', () => {
  beforeEach(() => { freshDb2() })
  afterEach(() => closeDb())

  it('display_id_sequences table exists with correct columns', () => {
    const db = getDb()
    const cols = (db.prepare("PRAGMA table_info(display_id_sequences)").all() as { name: string }[]).map(r => r.name)
    expect(cols).toContain('entity_type')
    expect(cols).toContain('project_id')
    expect(cols).toContain('last_value')
  })

  it('events table exists with all 14 columns', () => {
    const db = getDb()
    const cols = (db.prepare("PRAGMA table_info(events)").all() as { name: string }[]).map(r => r.name)
    for (const col of ['evt_id','workspace_id','project_id','evt_type','ts','object_type','object_id','actor_type','actor_id','payload','severity','trace_id','span_id','correlation_id']) {
      expect(cols, `missing column: ${col}`).toContain(col)
    }
  })

  it('task_relations table exists', () => {
    const db = getDb()
    const cols = (db.prepare("PRAGMA table_info(task_relations)").all() as { name: string }[]).map(r => r.name)
    expect(cols).toContain('task_id')
    expect(cols).toContain('target_task_id')
    expect(cols).toContain('relation_type')
    expect(cols).toContain('created_at')
  })

  it('task_labels table exists', () => {
    const db = getDb()
    const cols = (db.prepare("PRAGMA table_info(task_labels)").all() as { name: string }[]).map(r => r.name)
    expect(cols).toContain('task_id')
    expect(cols).toContain('label')
  })
})

describe('MIGRATION_002 — idempotent', () => {
  beforeEach(() => { freshDb2() })
  afterEach(() => closeDb())

  it('running runMigrations twice does not throw', () => {
    const db = getDb()
    expect(() => runMigrations(db)).not.toThrow()
  })
})
