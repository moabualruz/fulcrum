// v2a PR 5 Task 28 + v2b PR 15 completion — `fulcrum memory rollback`
// operator-only command. Deletes memory rows created since --since, scoped
// to the current workspace unless --cross-workspace is set. NOT registered
// in TOOL_REGISTRY: a compromised agent with action-exec access cannot call
// it. Triple-gated: --since, --yes-i-really-want-to-undo-N-writes, and
// (for cross-workspace) --yes-cross-workspace.

import type { Db } from 'fulcrum-agent-core'
import { getDb, loadConfig, runMigrations } from 'fulcrum-agent-core'

export interface RollbackInput {
  since: string
  crossWorkspace: boolean
  workspaceId?: string
  db?: Db
}

export interface RollbackResult {
  deleted: number
  scanned: number
  since: string
  workspaceIds: string[]
}

/**
 * Count + delete memories where created_at > since.
 * When crossWorkspace is false, scoped to workspaceId; otherwise global.
 * Writes a `memory_rollback_events` row (created on demand) so the rollback
 * is itself auditable.
 */
export async function rollbackMemories(input: RollbackInput): Promise<RollbackResult> {
  const db = input.db ?? getDb()
  // Ensure schema_migrations + memories tables exist for fresh targets.
  runMigrations(db)

  const sinceIso = input.since
  // Guard: reject ISO-8601-invalid input early so we don't mass-delete by
  // SQLite's permissive string-compare on garbage input.
  if (Number.isNaN(Date.parse(sinceIso))) {
    throw new Error(`rollback: --since is not a valid ISO-8601 timestamp: "${sinceIso}"`)
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_rollback_events (
      rollback_id   TEXT PRIMARY KEY,
      since         TEXT NOT NULL,
      workspace_id  TEXT,
      cross_workspace INTEGER NOT NULL DEFAULT 0,
      deleted       INTEGER NOT NULL,
      ran_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  const where = input.crossWorkspace
    ? 'created_at > ?'
    : 'created_at > ? AND workspace_id = ?'
  const params: (string)[] = input.crossWorkspace
    ? [sinceIso]
    : [sinceIso, input.workspaceId ?? '']

  // Collect workspaces first (for audit output).
  const wsRows = db.prepare(
    `SELECT DISTINCT workspace_id FROM memories WHERE ${where}`
  ).all(...params) as Array<{ workspace_id: string }>

  const countRow = db.prepare(
    `SELECT COUNT(*) as n FROM memories WHERE ${where}`
  ).get(...params) as { n: number }

  const deleted = db.prepare(
    `DELETE FROM memories WHERE ${where}`
  ).run(...params)

  db.prepare(`
    INSERT INTO memory_rollback_events (rollback_id, since, workspace_id, cross_workspace, deleted)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    `rb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sinceIso,
    input.workspaceId ?? null,
    input.crossWorkspace ? 1 : 0,
    deleted.changes ?? 0,
  )

  return {
    deleted: deleted.changes ?? 0,
    scanned: countRow.n,
    since: sinceIso,
    workspaceIds: wsRows.map(r => r.workspace_id),
  }
}

/** CLI entry point for `fulcrum memory rollback`. */
export async function runMemoryRollback(args: string[]): Promise<void> {
  const sinceArg = args.find(a => a.startsWith('--since='))
  const consentArg = args.find(a => /^--yes-i-really-want-to-undo-\d+-writes$/.test(a))
  const crossWorkspace = args.includes('--cross-workspace')
  const crossWorkspaceConsent = args.includes('--yes-cross-workspace')
  const dryRun = args.includes('--dry-run')

  if (!sinceArg) {
    console.error('Usage: fulcrum memory rollback --since=<ISO-TIMESTAMP> --yes-i-really-want-to-undo-N-writes')
    console.error('       --cross-workspace requires an additional --yes-cross-workspace confirmation.')
    process.exit(2)
  }
  if (!consentArg) {
    console.error('Refusing to rollback without --yes-i-really-want-to-undo-N-writes (operator-only command).')
    process.exit(2)
  }
  if (crossWorkspace && !crossWorkspaceConsent) {
    console.error('--cross-workspace also requires --yes-cross-workspace.')
    process.exit(2)
  }

  const since = sinceArg.slice('--since='.length)
  const config = loadConfig()
  const workspaceId = config.workspace_id ?? 'default'

  if (dryRun) {
    const db = getDb()
    runMigrations(db)
    const where = crossWorkspace
      ? 'created_at > ?'
      : 'created_at > ? AND workspace_id = ?'
    const params: string[] = crossWorkspace ? [since] : [since, workspaceId]
    const countRow = db.prepare(
      `SELECT COUNT(*) as n FROM memories WHERE ${where}`
    ).get(...params) as { n: number }
    console.log(`[rollback] --dry-run: would delete ${countRow.n} memories since ${since}${crossWorkspace ? ' across all workspaces' : ` in workspace ${workspaceId}`}.`)
    return
  }

  const result = await rollbackMemories({
    since,
    crossWorkspace,
    workspaceId,
  })

  console.log(`[rollback] deleted ${result.deleted} memories since ${since} (scope=${crossWorkspace ? 'cross-workspace' : workspaceId}).`)
  if (result.workspaceIds.length > 0) {
    console.log(`[rollback] touched workspaces: ${result.workspaceIds.join(', ')}`)
  }
}
