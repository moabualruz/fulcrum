// packages/memory/src/tests/helpers.ts
import Database from 'better-sqlite3'
import { setDb, closeDb, _configureDb, runMigrations } from 'fulcrum-core'

export function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  return db
}

export function resetTestDb(): void {
  closeDb()
}

export function seedWorkspaceAndProject(db: Database.Database, wsId = 'ws_1', projId = 'proj_1'): void {
  db.prepare("INSERT OR IGNORE INTO workspaces(workspace_id, name) VALUES (?, ?)").run(wsId, wsId)
  db.prepare("INSERT OR IGNORE INTO projects(project_id, workspace_id, name) VALUES (?, ?, ?)").run(projId, wsId, projId)
}
