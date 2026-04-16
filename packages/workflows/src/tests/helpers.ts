// packages/workflows/src/tests/helpers.ts
import Database from 'better-sqlite3'
import { setDb, closeDb, runMigrations } from '@moabualruz/fulcrum-core'
import { runMigration007Workflows } from '../schema.js'

export function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  runMigrations(db)
  runMigration007Workflows(db)
  setDb(db)
  return db
}

export function resetTestDb(): void {
  closeDb()
}

export function seed(db: Database.Database): { workspace_id: string; project_id: string } {
  const workspace_id = 'ws_wf_test_01'
  const project_id = 'proj_wf_test_01'
  db.prepare(
    `INSERT OR IGNORE INTO workspaces(workspace_id, name, created_at)
     VALUES (?, 'Workflow Test Workspace', datetime('now'))`
  ).run(workspace_id)
  db.prepare(
    `INSERT OR IGNORE INTO projects(project_id, workspace_id, name, created_at)
     VALUES (?, ?, 'Workflow Test Project', datetime('now'))`
  ).run(project_id, workspace_id)
  return { workspace_id, project_id }
}
