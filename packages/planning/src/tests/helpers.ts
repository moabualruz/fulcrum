// packages/planning/src/tests/helpers.ts
import Database from 'better-sqlite3'
import { setDb, closeDb, _configureDb, runMigrations } from '@moabualruz/fulcrum-core'

export function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)  // runs MIGRATION_001 + MIGRATION_002 + MIGRATION_003
  setDb(db)
  return db
}

export function resetTestDb(): void {
  closeDb()
}

export function seed(db: Database.Database): void {
  db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_1','test ws')").run()
  db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_1','ws_1','test proj')").run()
}
