// Minimal structural type for the SQLite handle the daemon handlers consume.
// We deliberately keep this thin so the indexer module does not hard-depend on
// better-sqlite3's typings — the daemon can run without ever opening the DB.

export interface PreparedStatement {
  get(...params: unknown[]): unknown
  run(...params: unknown[]): unknown
  all(...params: unknown[]): unknown[]
}

export interface Db {
  prepare(sql: string): PreparedStatement
}
