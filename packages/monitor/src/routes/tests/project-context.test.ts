import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { _configureDb, setDb, closeDb, runMigrations } from 'fulcrum-agent-core'
import { handleProjectContext } from '../project-context.js'

function freshDb() {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  return db
}

function seedData(db: ReturnType<typeof freshDb>) {
  db.prepare(`INSERT OR IGNORE INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_test','w','active','2026-01-01T00:00:00Z')`).run()
  db.prepare(`INSERT OR IGNORE INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_test','ws_test','p','git','active','worktree','2026-01-01T00:00:00Z')`).run()
  db.prepare(`
    INSERT INTO memories (memory_id, workspace_id, project_id, content, kind, scope, normalize_version, created_at, updated_at)
    VALUES ('mem_001','ws_test','proj_test','auth decision content','decision','project',1,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')
  `).run()
}

describe('handleProjectContext', () => {
  afterEach(() => closeDb())

  it('returns shape-stable response for valid workspace_id', async () => {
    const db = freshDb()
    seedData(db)
    const result = await handleProjectContext({ workspace_id: 'ws_test' }, db)
    expect(result).not.toHaveProperty('error')
    expect(result).toHaveProperty('body')
  })

  it('returns 400 when workspace_id is missing', async () => {
    const db = freshDb()
    const result = await handleProjectContext({ workspace_id: '' }, db)
    expect(result).toHaveProperty('status', 400)
  })

  it('response body matches project_context action shape (no null fields)', async () => {
    const db = freshDb()
    seedData(db)
    const result = await handleProjectContext({ workspace_id: 'ws_test', file: 'src/auth.ts' }, db)
    expect(result).toHaveProperty('body')
    const body = (result as { body: Record<string, unknown> }).body
    // Empty groups should be OMITTED per §11.40
    for (const [, val] of Object.entries(body)) {
      expect(val).not.toBeNull()
      expect(val).not.toBeUndefined()
    }
  })
})
