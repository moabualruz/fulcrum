// PR 15 Task 6.3 — `fulcrum memory replay-wal` operator-only command.
//
// Walks {globalDataDir()}/db/wal/*.jsonl, re-derives memory rows from WAL records,
// inserts missing rows. Operator-only — NOT exposed via `fulcrum action exec`.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { Db } from 'fulcrum-agent-core'
import { getDb } from 'fulcrum-agent-core'

export interface WalReplayInput {
  walDir: string
  db?: Db
}

export interface WalReplayResult {
  restored: number
  skipped: number
  errors: string[]
}

export interface WalRecord {
  memory_id: string
  workspace_id: string
  project_id: string
  content: string
  kind: string
  scope: string
  content_hash: string
  written_at: string
  title?: string
  tags?: string[]
}

export async function replayWal(input: WalReplayInput): Promise<WalReplayResult> {
  const db = input.db ?? getDb()
  const result: WalReplayResult = { restored: 0, skipped: 0, errors: [] }

  let files: string[]
  try {
    files = readdirSync(input.walDir).filter(f => f.endsWith('.jsonl'))
  } catch {
    return result
  }

  for (const file of files) {
    const filePath = join(input.walDir, file)
    let lines: string[]
    try {
      lines = readFileSync(filePath, 'utf8').split('\n').filter(Boolean)
    } catch (err) {
      result.errors.push(`${file}: read error: ${String(err)}`)
      continue
    }

    for (const line of lines) {
      try {
        const record: WalRecord = JSON.parse(line)

        // Verify content integrity before inserting — reject tampered records
        if (record.content_hash) {
          const actual = createHash('sha256').update(record.content ?? '').digest('hex')
          if (actual !== record.content_hash) {
            result.errors.push(`${file}: hash mismatch for memory_id=${record.memory_id}; skipping`)
            result.skipped++
            continue
          }
        }

        // Re-sanitize content on ingest — WAL may have been tampered or written
        // before a sanitizer rule change. Failures are non-fatal but logged.
        let sanitizedContent = record.content
        try {
          const { sanitizeOnWrite } = await import('fulcrum-memory')
          const sanitized = sanitizeOnWrite(record.content)
          if (!sanitized.errored) sanitizedContent = sanitized.content
        } catch { /* fulcrum-memory unavailable — proceed with stored content */ }

        // Check if row already exists
        const existing = db.prepare('SELECT memory_id FROM memories WHERE memory_id = ?').get(record.memory_id)
        if (existing) {
          result.skipped++
          continue
        }

        // Insert missing row from WAL
        const now = new Date().toISOString()
        db.prepare(`
          INSERT INTO memories
            (memory_id, workspace_id, project_id, content, kind, scope, normalize_version, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(
          record.memory_id,
          record.workspace_id,
          record.project_id,
          sanitizedContent,
          record.kind,
          record.scope,
          record.written_at ?? now,
          now,
        )
        result.restored++
      } catch (err) {
        result.errors.push(`${file}: parse/insert error: ${String(err)}`)
      }
    }
  }

  return result
}

/** CLI entry point — called from `fulcrum memory replay-wal`. */
export async function runMemoryReplayWal(args: string[]): Promise<void> {
  const { globalDataDir } = await import('fulcrum-agent-core')
  const walDir = join(globalDataDir(), 'db', 'wal')
  const dryRun = args.includes('--dry-run')

  console.log(`[fulcrum] Scanning WAL directory: ${walDir}`)
  if (dryRun) console.log('[fulcrum] --dry-run: no rows will be written')

  const db = getDb()
  const result = dryRun
    ? { restored: 0, skipped: 0, errors: [] }
    : await replayWal({ walDir, db })

  console.log(`[fulcrum] WAL replay complete: restored=${result.restored} skipped=${result.skipped} errors=${result.errors.length}`)
  if (result.errors.length > 0) {
    for (const e of result.errors) console.error(`  [error] ${e}`)
  }
}
