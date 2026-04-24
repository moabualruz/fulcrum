import type Database from "better-sqlite3";

export function withTransaction<T>(db: Database.Database, work: () => T): T {
  return db.transaction(work)();
}
