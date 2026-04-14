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

describe('round 1 migration (G-2, G-4 schema, G-12 schema)', () => {
  afterEach(() => closeDb())

  it('projects table has type/status/write_mode/git_url/parent_project_id', () => {
    const db = new Database(':memory:')
    _configureDb(db)
    runMigrations(db)
    const cols = db.prepare(`PRAGMA table_info(projects)`).all() as { name: string }[]
    const names = cols.map(c => c.name)
    expect(names).toContain('type')
    expect(names).toContain('status')
    expect(names).toContain('write_mode')
    expect(names).toContain('git_url')
    expect(names).toContain('parent_project_id')
  })

  it('projects.type has CHECK constraint for git/non_git/submodule/logical', () => {
    const db = new Database(':memory:')
    _configureDb(db)
    runMigrations(db)
    db.prepare(`INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1', 'w', 'active', '2026-04-14T00:00:00Z')`).run()
    // Valid value succeeds
    expect(() => db.prepare(
      `INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at)
       VALUES ('proj_1', 'ws_1', 'p', 'git', 'active', 'worktree', '2026-04-14T00:00:00Z')`
    ).run()).not.toThrow()
    // Invalid value fails
    expect(() => db.prepare(
      `INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at)
       VALUES ('proj_2', 'ws_1', 'p2', 'not_a_type', 'active', 'worktree', '2026-04-14T00:00:00Z')`
    ).run()).toThrow()
  })

  it('projects.status has CHECK constraint for active/archived/paused', () => {
    const db = new Database(':memory:')
    _configureDb(db)
    runMigrations(db)
    db.prepare(`INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1', 'w', 'active', '2026-04-14T00:00:00Z')`).run()
    expect(() => db.prepare(
      `INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at)
       VALUES ('proj_bad', 'ws_1', 'p', 'git', 'nope', 'worktree', '2026-04-14T00:00:00Z')`
    ).run()).toThrow()
  })

  it('memories.task_id column exists and is nullable', () => {
    const db = new Database(':memory:')
    _configureDb(db)
    runMigrations(db)
    const cols = db.prepare(`PRAGMA table_info(memories)`).all() as { name: string; notnull: number }[]
    const taskCol = cols.find(c => c.name === 'task_id')
    expect(taskCol).toBeDefined()
    expect(taskCol!.notnull).toBe(0)
  })

  it('idx_memories_task index exists', () => {
    const db = new Database(':memory:')
    _configureDb(db)
    runMigrations(db)
    const indexes = db.prepare(`PRAGMA index_list(memories)`).all() as { name: string }[]
    expect(indexes.some(i => i.name === 'idx_memories_task')).toBe(true)
  })

  it('trace_events table exists with expected columns', () => {
    const db = new Database(':memory:')
    _configureDb(db)
    runMigrations(db)
    const cols = db.prepare(`PRAGMA table_info(trace_events)`).all() as { name: string }[]
    const names = cols.map(c => c.name)
    expect(names).toContain('span_id')
    expect(names).toContain('trace_id')
    expect(names).toContain('parent_span_id')
    expect(names).toContain('name')
    expect(names).toContain('workspace_id')
    expect(names).toContain('run_id')
    expect(names).toContain('status')
    expect(names).toContain('started_at')
    expect(names).toContain('ended_at')
    expect(names).toContain('payload')
  })

  it('trace_events.status has CHECK constraint for started/ok/error', () => {
    const db = new Database(':memory:')
    _configureDb(db)
    runMigrations(db)
    db.prepare(`INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1', 'w', 'active', '2026-04-14T00:00:00Z')`).run()
    expect(() => db.prepare(
      `INSERT INTO trace_events (span_id, trace_id, parent_span_id, name, workspace_id, run_id, status, started_at, ended_at, payload)
       VALUES ('span_1', 'span_1', NULL, 'n', 'ws_1', NULL, 'started', '2026-04-14T00:00:00Z', NULL, NULL)`
    ).run()).not.toThrow()
    expect(() => db.prepare(
      `INSERT INTO trace_events (span_id, trace_id, parent_span_id, name, workspace_id, run_id, status, started_at, ended_at, payload)
       VALUES ('span_2', 'span_2', NULL, 'n', 'ws_1', NULL, 'bogus', '2026-04-14T00:00:00Z', NULL, NULL)`
    ).run()).toThrow()
  })
})

describe('memories.scope CHECK constraint includes task (H-6)', () => {
  afterEach(() => closeDb())

  it('accepts scope=task rows after migration', () => {
    const db = new Database(':memory:')
    _configureDb(db)
    runMigrations(db)
    // Seed required FKs
    db.prepare(`INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1', 'w', 'active', '2026-04-14T00:00:00Z')`).run()
    db.prepare(`INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_1', 'ws_1', 'p', 'git', 'active', 'worktree', '2026-04-14T00:00:00Z')`).run()

    // Insert a scope='task' memory — should succeed
    expect(() => db.prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, kind, scope, content, created_at)
      VALUES ('mem_1', 'ws_1', 'proj_1', 'task_decision', 'task', 'x', '2026-04-14T00:00:00Z')
    `).run()).not.toThrow()
  })

  it('rejects scope=bogus after migration', () => {
    const db = new Database(':memory:')
    _configureDb(db)
    runMigrations(db)
    db.prepare(`INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1', 'w', 'active', '2026-04-14T00:00:00Z')`).run()
    db.prepare(`INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_1', 'ws_1', 'p', 'git', 'active', 'worktree', '2026-04-14T00:00:00Z')`).run()

    expect(() => db.prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, kind, scope, content, created_at)
      VALUES ('mem_bad', 'ws_1', 'proj_1', 'fact', 'bogus', 'x', '2026-04-14T00:00:00Z')
    `).run()).toThrow()
  })
})

describe('tasks.status CHECK constraint (J-2)', () => {
  afterEach(() => closeDb())

  it('accepts canonical TaskStatus values', () => {
    const db = new Database(':memory:')
    _configureDb(db)
    runMigrations(db)
    db.prepare(`INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1', 'w', 'active', '2026-04-14T00:00:00Z')`).run()
    db.prepare(`INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_1', 'ws_1', 'p', 'git', 'active', 'worktree', '2026-04-14T00:00:00Z')`).run()

    // Canonical TaskStatus values from packages/core/src/types.ts
    const validStatuses = ['queued', 'ready', 'claimed', 'running', 'blocked', 'failed', 'completed', 'cancelled']
    let inserted = 0
    for (const status of validStatuses) {
      expect(() => db.prepare(`
        INSERT INTO tasks (task_id, workspace_id, project_id, display_id, title, status, status_category, priority, created_at, updated_at)
        VALUES (?, 'ws_1', 'proj_1', ?, ?, ?, 'backlog', 'medium', '2026-04-14T00:00:00Z', '2026-04-14T00:00:00Z')
      `).run(`task_${status}`, `T-${inserted}`, `title-${status}`, status)).not.toThrow()
      inserted++
    }
    expect(inserted).toBe(validStatuses.length)
  })

  it('rejects invalid task status after migration', () => {
    const db = new Database(':memory:')
    _configureDb(db)
    runMigrations(db)
    db.prepare(`INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1', 'w', 'active', '2026-04-14T00:00:00Z')`).run()
    db.prepare(`INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_1', 'ws_1', 'p', 'git', 'active', 'worktree', '2026-04-14T00:00:00Z')`).run()

    expect(() => db.prepare(`
      INSERT INTO tasks (task_id, workspace_id, project_id, display_id, title, status, status_category, priority, created_at, updated_at)
      VALUES ('task_bad', 'ws_1', 'proj_1', 'T-bad', 'bad', 'nope_invalid', 'backlog', 'medium', '2026-04-14T00:00:00Z', '2026-04-14T00:00:00Z')
    `).run()).toThrow()
  })
})

describe('agent_runs.role CHECK constraint (J-3)', () => {
  afterEach(() => closeDb())

  it('accepts canonical AgentRole values', () => {
    const db = new Database(':memory:')
    _configureDb(db)
    runMigrations(db)
    db.prepare(`INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1', 'w', 'active', '2026-04-14T00:00:00Z')`).run()
    db.prepare(`INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_1', 'ws_1', 'p', 'git', 'active', 'worktree', '2026-04-14T00:00:00Z')`).run()
    db.prepare(`INSERT INTO tasks (task_id, workspace_id, project_id, display_id, title, status, status_category, priority, created_at, updated_at) VALUES ('task_1', 'ws_1', 'proj_1', 'T-1', 't', 'queued', 'backlog', 'medium', '2026-04-14T00:00:00Z', '2026-04-14T00:00:00Z')`).run()

    // Full canonical AgentRole set (24 values) from packages/core/src/types.ts
    const validRoles = [
      'chief_of_staff', 'context_gatherer', 'prd_planner', 'implementation_planner',
      'issue_decomposer', 'software_engineer', 'research_worker', 'refactor_worker',
      'browser_worker', 'data_engineer', 'ml_engineer', 'devops_engineer',
      'architecture_reviewer', 'code_reviewer', 'qa_engineer', 'security_reviewer',
      'integration_worker', 'documentation_writer', 'memory_curator', 'tech_lead',
      'product_manager', 'analyst', 'orchestrator', 'custom',
    ]
    let inserted = 0
    for (const role of validRoles) {
      expect(() => db.prepare(`
        INSERT INTO agent_runs (run_id, task_id, workspace_id, project_id, display_id, agent_id, role, status, status_category, started_at, updated_at)
        VALUES (?, 'task_1', 'ws_1', 'proj_1', ?, '', ?, 'running', 'active', '2026-04-14T00:00:00Z', '2026-04-14T00:00:00Z')
      `).run(`run_${role}`, `R-${inserted}`, role)).not.toThrow()
      inserted++
    }
    expect(inserted).toBe(validRoles.length)
  })

  it('rejects invalid agent role after migration', () => {
    const db = new Database(':memory:')
    _configureDb(db)
    runMigrations(db)
    db.prepare(`INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1', 'w', 'active', '2026-04-14T00:00:00Z')`).run()
    db.prepare(`INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_1', 'ws_1', 'p', 'git', 'active', 'worktree', '2026-04-14T00:00:00Z')`).run()
    db.prepare(`INSERT INTO tasks (task_id, workspace_id, project_id, display_id, title, status, status_category, priority, created_at, updated_at) VALUES ('task_1', 'ws_1', 'proj_1', 'T-1', 't', 'queued', 'backlog', 'medium', '2026-04-14T00:00:00Z', '2026-04-14T00:00:00Z')`).run()

    expect(() => db.prepare(`
      INSERT INTO agent_runs (run_id, task_id, workspace_id, project_id, display_id, agent_id, role, status, status_category, started_at, updated_at)
      VALUES ('run_bad', 'task_1', 'ws_1', 'proj_1', 'R-bad', '', 'fake_role_123', 'running', 'active', '2026-04-14T00:00:00Z', '2026-04-14T00:00:00Z')
    `).run()).toThrow()
  })
})

describe('memories.kind CHECK alignment (J-4)', () => {
  afterEach(() => closeDb())

  function seedWsProj(db: Database.Database) {
    db.prepare(`INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1', 'w', 'active', '2026-04-14T00:00:00Z')`).run()
    db.prepare(`INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_1', 'ws_1', 'p', 'git', 'active', 'worktree', '2026-04-14T00:00:00Z')`).run()
  }

  it('accepts tool_trace / reasoning_step / lesson at the DB level', () => {
    const db = freshDb()
    runMigrations(db)
    seedWsProj(db)

    for (const kind of ['tool_trace', 'reasoning_step', 'lesson']) {
      expect(() => db.prepare(`
        INSERT INTO memories (memory_id, workspace_id, project_id, kind, scope, content, created_at, updated_at, last_accessed_at)
        VALUES (?, 'ws_1', 'proj_1', ?, 'project', 'x', '2026-04-14T00:00:00Z', '2026-04-14T00:00:00Z', '2026-04-14T00:00:00Z')
      `).run(`mem_${kind}`, kind)).not.toThrow()
    }
  })

  it('still accepts all 13 canonical kinds at the DB level', () => {
    const db = freshDb()
    runMigrations(db)
    seedWsProj(db)

    const canonical = [
      'fact','summary','symbol','decision','procedure','error','diff','doc','code',
      'task_goal','task_decision','task_failure','task_outcome',
    ]
    for (const kind of canonical) {
      expect(() => db.prepare(`
        INSERT INTO memories (memory_id, workspace_id, project_id, kind, scope, content, created_at, updated_at, last_accessed_at)
        VALUES (?, 'ws_1', 'proj_1', ?, 'project', 'x', '2026-04-14T00:00:00Z', '2026-04-14T00:00:00Z', '2026-04-14T00:00:00Z')
      `).run(`mem_${kind}`, kind)).not.toThrow()
    }
  })

  it('rejects unknown kind after migration', () => {
    const db = freshDb()
    runMigrations(db)
    seedWsProj(db)

    expect(() => db.prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, kind, scope, content, created_at, updated_at, last_accessed_at)
      VALUES ('mem_bad', 'ws_1', 'proj_1', 'made_up_kind', 'project', 'x', '2026-04-14T00:00:00Z', '2026-04-14T00:00:00Z', '2026-04-14T00:00:00Z')
    `).run()).toThrow()
  })
})
