// packages/memory/src/migration/backfill.ts
//
// Memory v3 PR 6 unit 6.3 — DB backfill.
//
// Consumes the manifest produced by 6.2 `migrateAllMemories` and applies the
// DB side of the cutover:
//
//   L0_raw
//     INSERT OR IGNORE INTO l0_sources (source_id = memory_id, …)
//     DELETE FROM memories WHERE memory_id = ?
//     Explicit cleanup of FK-less companions (memory_tags, memory_wikilinks,
//     memory_recall_events, vec_memories) — FK-backed tables cascade.
//
//   L1_curated_stub
//     UPDATE memories SET
//       schema_version = 3,
//       retention_tier = 'working',
//       confidence_decay_at = datetime('now'),
//       confidence = 0.5,                 -- matches the stub vault file
//       vault_path = <curated/...>,
//       provenance = json_object('sources', json('[]'))
//     WHERE memory_id = ?
//
//   unknown → untouched (classifier opt-in only).
//
// Each row runs inside its own SQLite transaction so one bad row does not
// roll back the rest of the batch. Errors are collected, not thrown.

import type Database from 'better-sqlite3'
import type { MigrationRecord } from './migrator.js'

export interface BackfillCounts {
  l0_inserted: number
  l0_deleted: number
  l1_backfilled: number
  unknown_skipped: number
}

export type BackfillStage = 'l0_insert' | 'l0_delete' | 'l1_update'

export interface BackfillError {
  memory_id: string
  kind: string
  stage: BackfillStage
  message: string
}

export interface BackfillResult {
  counts: BackfillCounts
  errors: BackfillError[]
}

export interface BackfillOptions {
  dry_run?: boolean
}

function applyL0(db: Database.Database, rec: MigrationRecord): { inserted: boolean; deleted: boolean } {
  // Pull session_id + created_at back from the memories row so we faithfully
  // populate l0_sources. The migrator set vault_path / content_hash / size_bytes
  // on the manifest — reuse those.
  const row = db.prepare(
    `SELECT session_id, created_at FROM memories WHERE memory_id = ?`,
  ).get(rec.memory_id) as { session_id: string | null; created_at: string } | undefined
  const session_id = row?.session_id ?? null
  const created_at = row?.created_at ?? new Date().toISOString()

  // Idempotency by hand (keeps error reporting on NOT NULL / FK violations —
  // INSERT OR IGNORE would silently swallow those and we'd lose the signal).
  const existing = db.prepare(
    'SELECT content_hash FROM l0_sources WHERE source_id = ?',
  ).get(rec.memory_id) as { content_hash: string } | undefined
  let inserted = false
  if (existing === undefined) {
    db.prepare(`
      INSERT INTO l0_sources
        (source_id, source_type, session_id, workspace_id, project_id, cwd, vault_path, content_hash, size_bytes, created_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
    `).run(
      rec.memory_id,
      rec.l0_source_type ?? null,
      session_id,
      rec.workspace_id,
      rec.project_id,
      rec.vault_path,
      rec.content_hash,
      rec.size_bytes,
      created_at,
    )
    inserted = true
  } else if (existing.content_hash !== rec.content_hash) {
    throw new Error(
      `backfill: l0_sources row '${rec.memory_id}' already exists with a different content_hash — refusing to overwrite`,
    )
  }

  // Companion cleanup before DELETE — memory_tags / memory_wikilinks /
  // memory_recall_events / vec_memories all reference memory_id without a FK.
  db.prepare('DELETE FROM memory_tags WHERE memory_id = ?').run(rec.memory_id)
  db.prepare('DELETE FROM memory_wikilinks WHERE src_memory_id = ?').run(rec.memory_id)
  db.prepare('DELETE FROM memory_recall_events WHERE memory_id = ?').run(rec.memory_id)
  try {
    db.prepare('DELETE FROM vec_memories WHERE memory_id = ?').run(rec.memory_id)
  } catch {
    // vec_memories is a vec0 virtual table; not every test DB has sqlite-vec
    // loaded. The migration path tolerates the module being absent.
  }

  const delRes = db.prepare('DELETE FROM memories WHERE memory_id = ?').run(rec.memory_id)

  return { inserted, deleted: delRes.changes > 0 }
}

function applyL1(db: Database.Database, rec: MigrationRecord): { backfilled: boolean } {
  // Only touch rows still pre-v3 so re-running is a no-op.
  const res = db.prepare(`
    UPDATE memories SET
      schema_version      = 3,
      retention_tier      = 'working',
      confidence_decay_at = datetime('now'),
      confidence          = 0.5,
      vault_path          = ?,
      provenance          = json_object('sources', json('[]'))
    WHERE memory_id = ? AND (schema_version IS NULL OR schema_version < 3)
  `).run(rec.vault_path, rec.memory_id)
  return { backfilled: res.changes > 0 }
}

export function applyDbBackfill(
  db: Database.Database,
  manifest: MigrationRecord[],
  opts: BackfillOptions = {},
): BackfillResult {
  const counts: BackfillCounts = {
    l0_inserted: 0,
    l0_deleted: 0,
    l1_backfilled: 0,
    unknown_skipped: 0,
  }
  const errors: BackfillError[] = []

  for (const rec of manifest) {
    if (rec.classification === 'unknown') {
      counts.unknown_skipped++
      continue
    }
    if (opts.dry_run) {
      if (rec.classification === 'l0_raw') counts.l0_inserted++
      else if (rec.classification === 'l1_curated_stub') counts.l1_backfilled++
      continue
    }
    // Per-row transaction keeps one bad row from stranding the batch.
    const txn = db.transaction(() => {
      if (rec.classification === 'l0_raw') {
        const r = applyL0(db, rec)
        if (r.inserted) counts.l0_inserted++
        if (r.deleted) counts.l0_deleted++
      } else {
        const r = applyL1(db, rec)
        if (r.backfilled) counts.l1_backfilled++
      }
    })
    try {
      txn()
    } catch (err) {
      errors.push({
        memory_id: rec.memory_id,
        kind: rec.kind,
        stage: rec.classification === 'l0_raw' ? 'l0_insert' : 'l1_update',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { counts, errors }
}
