// packages/teams/src/tests/helpers.ts
import Database from 'better-sqlite3'
import { setDb, closeDb, runMigrations } from '@fulcrum/core'
import { runMigration006Teams } from '../schema.js'

export function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  // @fulcrum/core configures WAL, pragmas
  runMigrations(db)
  runMigration006Teams(db)
  setDb(db)
  return db
}

export function resetTestDb(): void {
  closeDb()
}

export function seed(db: Database.Database): { workspace_id: string; project_id: string } {
  const workspace_id = 'ws_test_01'
  const project_id = 'proj_test_01'
  db.prepare(
    `INSERT OR IGNORE INTO workspaces(workspace_id, name, created_at)
     VALUES (?, 'Test Workspace', datetime('now'))`
  ).run(workspace_id)
  db.prepare(
    `INSERT OR IGNORE INTO projects(project_id, workspace_id, name, created_at)
     VALUES (?, ?, 'Test Project', datetime('now'))`
  ).run(project_id, workspace_id)
  return { workspace_id, project_id }
}
