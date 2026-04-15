// packages/core/src/db/migrations/m042.ts
// GAP-RAG-3: Add code_chunks_fts with unicode61 tokenizer + identifier separators.
//
// `memories_fts` is intentionally left untouched — it indexes natural-language
// memories and benefits from the default porter stemmer.
//
// `code_chunks_fts` is a new FTS5 index over `code_chunks.content` and
// `code_chunks.symbol_path`. It uses unicode61 with separator chars `.`, `_`,
// `-` so that identifiers are split into constituent tokens:
//   "get_user_by_id" → "get", "user", "by", "id"
//   "HttpClientError" → single token (camelCase is not split — see NOTE below)
//   "fulcrum.core"   → "fulcrum", "core"
//
// NOTE: camelCase splitting requires either preprocessing at ingest time or a
// custom tokenizer. This migration handles the common snake_case and dot/hyphen
// patterns; callers that need camelCase search should pre-split identifiers
// before insertion (e.g. "getUserById" → "get user by id") using a utility like
// `splitCamelCase()` from the memory package.

import type Database from 'better-sqlite3'

export function runM042(db: Database.Database): void {
  // Idempotency guard
  const existing = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='code_chunks_fts'`
  ).get()
  if (existing) return

  // Create FTS5 index for code content and symbol names.
  // FTS5 tokenize argument: option values must be quoted strings within the
  // tokenize directive. In a SQL single-quoted string, a literal `'` is `''`.
  // So `separators ''._-''` encodes the value `'._-'`.
  db.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS code_chunks_fts USING fts5(` +
    `  content,` +
    `  symbol_path,` +
    `  content='code_chunks',` +
    `  content_rowid='rowid',` +
    `  tokenize='unicode61 remove_diacritics 1 separators ''._-'''` +
    `)`
  )

  // Backfill existing code_chunks rows
  db.exec(
    `INSERT INTO code_chunks_fts(rowid, content, symbol_path) ` +
    `  SELECT rowid, content, COALESCE(symbol_path, '') FROM code_chunks`
  )

  // Triggers to keep the index in sync
  db.exec(
    `CREATE TRIGGER IF NOT EXISTS code_chunks_fts_insert AFTER INSERT ON code_chunks BEGIN ` +
    `  INSERT INTO code_chunks_fts(rowid, content, symbol_path) ` +
    `    VALUES (new.rowid, new.content, COALESCE(new.symbol_path, '')); ` +
    `END`
  )
  db.exec(
    `CREATE TRIGGER IF NOT EXISTS code_chunks_fts_delete BEFORE DELETE ON code_chunks BEGIN ` +
    `  INSERT INTO code_chunks_fts(code_chunks_fts, rowid, content, symbol_path) ` +
    `    VALUES ('delete', old.rowid, old.content, COALESCE(old.symbol_path, '')); ` +
    `END`
  )
  db.exec(
    `CREATE TRIGGER IF NOT EXISTS code_chunks_fts_update AFTER UPDATE ON code_chunks BEGIN ` +
    `  INSERT INTO code_chunks_fts(code_chunks_fts, rowid, content, symbol_path) ` +
    `    VALUES ('delete', old.rowid, old.content, COALESCE(old.symbol_path, '')); ` +
    `  INSERT INTO code_chunks_fts(rowid, content, symbol_path) ` +
    `    VALUES (new.rowid, new.content, COALESCE(new.symbol_path, '')); ` +
    `END`
  )
}
