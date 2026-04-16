import type Database from 'better-sqlite3'
import { applySchema } from '../schema.js'

export function runMigrations(db: Database.Database): void {
  applySchema(db)
}
