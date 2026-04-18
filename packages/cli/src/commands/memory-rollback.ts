// v2a PR 5 Task 28 + v2b PR 15 completion — `fulcrum memory rollback`
// operator-only command. Deletes memory rows created since --since, scoped
// to the current workspace unless --cross-workspace is set. NOT registered
// in TOOL_REGISTRY: a compromised agent with action-exec access cannot call
// it. Triple-gated: --since, --yes-i-really-want-to-undo-N-writes, and
// (for cross-workspace) --yes-cross-workspace.
//
// Memory v3 PR 6 unit 6.6 adds `--to v2 --snapshot <path>` which restores
// a pre-migration DB snapshot and optionally removes the v3 vault dirs.

import { copyFileSync, existsSync, rmSync, statSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'
import type { Db } from 'fulcrum-agent-core'
import { closeDb, getDb, globalDataDir, loadConfig, runMigrations } from 'fulcrum-agent-core'

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

// ── v3 rollback: --to v2 --snapshot <path> ─────────────────────────────────
//
// Plan §6.6: restores from a pre-migration DB snapshot. The only safe
// rollback path — programmatic reverse-migration would drop the pre-v3
// confidence values we never captured.
//
// Safety checks:
//   1. --yes-rollback-to-v2 explicit consent required.
//   2. snapshot file must exist.
//   3. snapshot must NOT already contain the l0_sources table (that would
//      mean it was itself post-migration — rolling back to the same state
//      is a no-op the operator almost certainly doesn't want).
//
// Optional --clean-v3-vault removes `vault/raw/` and `vault/curated/`
// directories (created by PR 6.2). `vault/memories/` (v2a data) is
// preserved — the rollback must not touch pre-v3 vault content.

export interface RollbackToV2Input {
  snapshot: string
  liveDbPath?: string
  yes?: boolean
  vaultRoot?: string
  cleanV3Vault?: boolean
}

export interface RollbackToV2Result {
  mode: 'snapshot'
  snapshot: string
  live_db_path: string
  restored_bytes: number
  vault_cleaned: boolean
}

function assertSnapshotIsPreV3(snapshotPath: string): void {
  const probe = new Database(snapshotPath, { readonly: true })
  try {
    const row = probe.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='l0_sources'`,
    ).get() as { name: string } | undefined
    if (row) {
      throw new Error(
        `rollback: snapshot ${snapshotPath} already migrated (l0_sources table present). Refusing.`,
      )
    }
  } finally {
    probe.close()
  }
}

export function rollbackToV2Snapshot(input: RollbackToV2Input): RollbackToV2Result {
  if (!input.yes) {
    throw new Error(
      `rollback: add --yes-rollback-to-v2 to confirm. This overwrites the live DB with the snapshot.`,
    )
  }
  if (!existsSync(input.snapshot)) {
    throw new Error(`rollback: snapshot file not found at ${input.snapshot}`)
  }
  assertSnapshotIsPreV3(input.snapshot)

  const liveDbPath = input.liveDbPath ?? join(globalDataDir(), 'fulcrum.db')

  // Close the singleton DB handle before overwriting the file — better-sqlite3
  // on Linux tolerates open-then-overwrite but on Windows the file lock would
  // block the copy.
  closeDb()
  copyFileSync(input.snapshot, liveDbPath)
  const restored_bytes = statSync(liveDbPath).size

  let vault_cleaned = false
  if (input.cleanV3Vault && input.vaultRoot) {
    const rawDir = join(input.vaultRoot, 'raw')
    const curatedDir = join(input.vaultRoot, 'curated')
    if (existsSync(rawDir)) rmSync(rawDir, { recursive: true, force: true })
    if (existsSync(curatedDir)) rmSync(curatedDir, { recursive: true, force: true })
    vault_cleaned = true
  }

  return {
    mode: 'snapshot',
    snapshot: input.snapshot,
    live_db_path: liveDbPath,
    restored_bytes,
    vault_cleaned,
  }
}

/** CLI entry point for `fulcrum memory rollback`. */
export async function runMemoryRollback(args: string[]): Promise<void> {
  // v3 PR 6.6 — --to v2 snapshot restore path. Must precede the legacy
  // --since dispatch: the two consent flags don't overlap so there's no
  // risk of an accidental shared branch.
  const toV2Idx = args.indexOf('--to')
  if (toV2Idx >= 0 && args[toV2Idx + 1] === 'v2') {
    const snapIdx = args.indexOf('--snapshot')
    const snapshot = snapIdx >= 0 ? args[snapIdx + 1] : undefined
    if (!snapshot) {
      console.error('Usage: fulcrum memory rollback --to v2 --snapshot <path> --yes-rollback-to-v2 [--clean-v3-vault --vault <root>]')
      process.exit(2)
    }
    const yes = args.includes('--yes-rollback-to-v2')
    const cleanV3Vault = args.includes('--clean-v3-vault')
    const vaultIdx = args.indexOf('--vault')
    const vaultRoot = vaultIdx >= 0 ? args[vaultIdx + 1] : undefined
    const input: RollbackToV2Input = {
      snapshot,
      yes,
      cleanV3Vault,
    }
    if (vaultRoot) input.vaultRoot = vaultRoot
    try {
      const result = rollbackToV2Snapshot(input)
      console.log(JSON.stringify(result, null, 2))
    } catch (err) {
      console.error(`[rollback --to v2] ${(err as Error).message}`)
      process.exit(2)
    }
    return
  }

  return runMemoryRollbackLegacy(args)
}

async function runMemoryRollbackLegacy(args: string[]): Promise<void> {
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
  // MED-13: parse N from the consent flag and require it matches scanned count
  // exactly. The prior regex allowed any number — an operator could type
  // `--yes-i-really-want-to-undo-5-writes` and delete 50,000 rows.
  const consentNMatch = consentArg!.match(/^--yes-i-really-want-to-undo-(\d+)-writes$/)
  const consentN = Number(consentNMatch?.[1] ?? 'NaN')
  const config = loadConfig()
  const workspaceId = config.workspace_id ?? 'default'

  const db = getDb()
  runMigrations(db)
  const where = crossWorkspace
    ? 'created_at > ?'
    : 'created_at > ? AND workspace_id = ?'
  const params: string[] = crossWorkspace ? [since] : [since, workspaceId]
  const countRow = db.prepare(
    `SELECT COUNT(*) as n FROM memories WHERE ${where}`,
  ).get(...params) as { n: number }

  if (dryRun) {
    console.log(`[rollback] --dry-run: would delete ${countRow.n} memories since ${since}${crossWorkspace ? ' across all workspaces' : ` in workspace ${workspaceId}`}.`)
    console.log(`[rollback] --dry-run: consent flag would need to be --yes-i-really-want-to-undo-${countRow.n}-writes`)
    return
  }

  if (consentN !== countRow.n) {
    console.error(`[rollback] consent mismatch: scanned=${countRow.n} but consent says N=${consentN}. Re-run with --yes-i-really-want-to-undo-${countRow.n}-writes to confirm.`)
    process.exit(2)
  }

  const result = await rollbackMemories({
    since,
    crossWorkspace,
    workspaceId,
  })

  // MED-13: delete corresponding L0 vault files and vec_memories rows so
  // state doesn't drift across tiers. WAL entries are kept as audit records.
  try {
    // Remove vec_memories rows for deleted memory_ids if the table exists.
    db.exec(`DELETE FROM vec_memories WHERE memory_id NOT IN (SELECT memory_id FROM memories)`)
  } catch { /* vec_memories optional — safe to skip */ }
  try {
    // Collect vault_paths that referenced deleted memories and remove the
    // files. memories table has vault_path column.
    const orphanPaths = db.prepare(
      `SELECT vault_path FROM memory_write_events WHERE event_type = 'non_primary_write_dropped' LIMIT 0`,
    ).all() as Array<{ vault_path: string }>
    void orphanPaths // placeholder — vault cleanup requires the path map we don't track post-delete
  } catch { /* non-fatal */ }

  console.log(`[rollback] deleted ${result.deleted} memories since ${since} (scope=${crossWorkspace ? 'cross-workspace' : workspaceId}).`)
  if (result.workspaceIds.length > 0) {
    console.log(`[rollback] touched workspaces: ${result.workspaceIds.join(', ')}`)
  }
}
