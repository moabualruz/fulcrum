// packages/worktrees/src/worktrees.ts
import { execFileSync } from 'child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  appendFileSync,
  writeFileSync,
} from 'fs'
import { dirname, join } from 'path'
import { getDb, FulcrumError, newId, canMerge, emitEvent, startSpan, endSpan, type AgentRole, Db} from 'fulcrum-agent-core'
import type {
  Worktree,
  MergeResult,
  AllocateWorktreeInput,
  MarkDirtyInput,
  MarkReadyInput,
  EnqueueMergeInput,
  DiscardWorktreeInput,
} from './types.js'

function rowToWorktree(row: Record<string, unknown>): Worktree {
  return {
    worktree_id: row.worktree_id as string,
    workspace_id: row.workspace_id as string,
    project_id: row.project_id as string,
    status: row.status as Worktree['status'],
    branch_name: row.branch_name as string,
    path: row.path as string,
    base_branch: (row.base_branch as string | null) ?? undefined,
    task_id: (row.task_id as string | null) ?? undefined,
    run_id: (row.run_id as string | null) ?? undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    merged_at: (row.merged_at as string | null) ?? undefined,
    discarded_at: (row.discarded_at as string | null) ?? undefined,
  }
}

// --- Git subprocess helpers (H-3) ------------------------------------------

/**
 * Look up a project's filesystem root. Convention: `projects.git_url` holds
 * the local path when the project was created from a local directory.
 *
 * Returns `null` if the project doesn't exist, has no path, or the path is
 * missing from disk.
 */
function projectRootFor(project_id: string, db: Db = getDb()): string | null {
  const row = db
    .prepare(`SELECT git_url FROM projects WHERE project_id = ?`)
    .get(project_id) as { git_url: string | null } | undefined
  if (!row || !row.git_url) return null
  if (!existsSync(row.git_url)) return null
  return row.git_url
}

/** True if `path` looks like a git working tree (has a `.git` entry). */
function isGitRepo(path: string): boolean {
  return existsSync(join(path, '.git'))
}

/**
 * Append `.fulcrum-worktrees/` to `<projectRoot>/.gitignore` if it isn't
 * already there. Idempotent: safe to call on every allocation.
 */
function ensureGitignoreEntry(projectRoot: string): void {
  const gitignorePath = join(projectRoot, '.gitignore')
  const ENTRY = '.fulcrum-worktrees/'
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf8')
    const alreadyHas = content
      .split('\n')
      .some(line => line.trim() === ENTRY || line.trim() === '/.fulcrum-worktrees/')
    if (alreadyHas) return
    const sep = content.length === 0 || content.endsWith('\n') ? '' : '\n'
    appendFileSync(gitignorePath, `${sep}${ENTRY}\n`)
  } else {
    writeFileSync(gitignorePath, `${ENTRY}\n`)
  }
}

export async function allocateWorktree(input: AllocateWorktreeInput, db: Db = getDb()): Promise<Worktree> {
  const worktree_id = newId('worktree')
  const now = new Date().toISOString()

  // Decide mode.
  //  - Managed mode: agent_role + base_branch → compute path/branch, run git.
  //  - Explicit mode: caller supplied branch_name+path → just insert a row.
  const managed = input.agent_role !== undefined && input.base_branch !== undefined

  let branch_name: string
  let path: string
  let base_branch: string | null = input.base_branch ?? null
  let runGit = false
  let projectRoot: string | null = null

  if (managed) {
    projectRoot = projectRootFor(input.project_id, db)
    if (!projectRoot) {
      throw new FulcrumError(
        `project ${input.project_id} has no valid filesystem path (git_url)`,
        'not_found'
      )
    }
    const suffix = worktree_id.slice(-8)
    branch_name = `fulcrum/${input.agent_role}/${suffix}`

    if (isGitRepo(projectRoot)) {
      // Real git repo — provision a git worktree under .fulcrum-worktrees/
      ensureGitignoreEntry(projectRoot)
      path = join(projectRoot, '.fulcrum-worktrees', worktree_id)
      mkdirSync(dirname(path), { recursive: true })
      runGit = true
    } else {
      // Non-git project (no .git dir) — fall back to sequential mode:
      // the worktree's "path" is the project root itself, and no branch
      // is created. Callers are expected to serialize writes via an
      // advisory lock.
      path = projectRoot
      runGit = false
    }
  } else {
    if (!input.branch_name || !input.path) {
      throw new FulcrumError(
        'allocateWorktree requires either (agent_role + base_branch) or (branch_name + path)',
        'invalid_input'
      )
    }
    branch_name = input.branch_name
    path = input.path
  }

  const span_id = await safeStartSpan({
    name: 'worktree.allocate',
    workspace_id: input.workspace_id,
    run_id: input.run_id,
    payload: {
      worktree_id,
      project_id: input.project_id,
      branch_name,
      path,
      base_branch,
      managed,
    },
  })

  try {
    // Insert DB row first so rollback on git failure is a simple DELETE.
    db.prepare(`
      INSERT INTO worktrees
        (worktree_id, workspace_id, project_id, status, branch_name, path, base_branch, task_id, run_id, created_at, updated_at)
      VALUES
        (?, ?, ?, 'allocated', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      worktree_id,
      input.workspace_id,
      input.project_id,
      branch_name,
      path,
      base_branch,
      input.task_id ?? null,
      input.run_id ?? null,
      now,
      now,
    )

    if (runGit && projectRoot) {
      try {
        execFileSync(
          'git',
          ['worktree', 'add', path, '-b', branch_name, input.base_branch!],
          { cwd: projectRoot, stdio: ['ignore', 'ignore', 'pipe'] }
        )
      } catch (err) {
        // Roll back the DB row so we don't leave a ghost.
        db.prepare(`DELETE FROM worktrees WHERE worktree_id = ?`).run(worktree_id)
        const stderr = (err as { stderr?: Buffer | string }).stderr?.toString() ?? ''
        const msg = stderr.trim() || (err as Error).message
        throw new FulcrumError(`git worktree add failed: ${msg}`, 'git_error')
      }
    }

    const row = db
      .prepare('SELECT * FROM worktrees WHERE worktree_id = ?')
      .get(worktree_id) as Record<string, unknown>

    const worktree = rowToWorktree(row)
    safeEmit({
      workspace_id: input.workspace_id,
      project_id: input.project_id,
      evt_type: 'worktree_allocated',
      object_type: 'worktree',
      object_id: worktree_id,
      actor_type: 'system',
      actor_id: input.run_id ?? 'worktrees',
      span_id,
      payload: {
        worktree_id,
        branch_name,
        path,
        base_branch,
        task_id: input.task_id,
        run_id: input.run_id,
      },
    })
    await safeEndSpan(span_id, 'ok', { status: 'allocated' })

    return worktree
  } catch (err) {
    await safeEndSpan(span_id, 'error', { error: (err as Error).message })
    throw err
  }
}

/**
 * Tear down a worktree: run `git worktree remove --force` (best-effort) and
 * delete the DB row. For non-git / sequential worktrees whose `path` is the
 * project root itself, only the DB row is removed — we never delete the
 * project root.
 */
export async function deallocateWorktree(input: { worktree_id: string }, db: Db = getDb()): Promise<void> {
  const row = db
    .prepare(`SELECT project_id, path FROM worktrees WHERE worktree_id = ?`)
    .get(input.worktree_id) as { project_id: string; path: string } | undefined
  if (!row) return

  const root = projectRootFor(row.project_id, db)
  if (root && isGitRepo(root) && row.path !== root) {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', row.path], {
        cwd: root,
        stdio: ['ignore', 'ignore', 'pipe'],
      })
    } catch {
      // best-effort — git may have already removed it, or the directory
      // may have been reaped out-of-band. Fall through to the DB delete.
    }
  }
  db.prepare(`DELETE FROM worktrees WHERE worktree_id = ?`).run(input.worktree_id)
}

export async function markDirty(input: MarkDirtyInput, db: Db = getDb()): Promise<Worktree> {
  const now = new Date().toISOString()

  const current = db
    .prepare('SELECT status FROM worktrees WHERE worktree_id = ?')
    .get(input.worktree_id) as { status: string } | undefined

  if (!current) throw new FulcrumError(`Worktree not found: ${input.worktree_id}`, 'not_found')
  if (current.status !== 'allocated') {
    throw new FulcrumError(
      `Cannot mark worktree ${input.worktree_id} as dirty: status is '${current.status}', expected 'allocated'`,
      'invalid_state'
    )
  }

  db.prepare(`
    UPDATE worktrees SET status = 'dirty', updated_at = ? WHERE worktree_id = ?
  `).run(now, input.worktree_id)

  const row = db
    .prepare('SELECT * FROM worktrees WHERE worktree_id = ?')
    .get(input.worktree_id) as Record<string, unknown>

  return rowToWorktree(row)
}

export async function markReadyForMerge(input: MarkReadyInput, db: Db = getDb()): Promise<Worktree> {
  const now = new Date().toISOString()

  const current = db
    .prepare('SELECT status FROM worktrees WHERE worktree_id = ?')
    .get(input.worktree_id) as { status: string } | undefined

  if (!current) throw new FulcrumError(`Worktree not found: ${input.worktree_id}`, 'not_found')
  if (current.status !== 'dirty') {
    throw new FulcrumError(
      `Cannot mark worktree ${input.worktree_id} as ready_for_merge: status is '${current.status}', expected 'dirty'`,
      'invalid_state'
    )
  }

  db.prepare(`
    UPDATE worktrees SET status = 'ready_for_merge', updated_at = ? WHERE worktree_id = ?
  `).run(now, input.worktree_id)

  const row = db
    .prepare('SELECT * FROM worktrees WHERE worktree_id = ?')
    .get(input.worktree_id) as Record<string, unknown>

  return rowToWorktree(row)
}

export async function enqueueMerge(input: EnqueueMergeInput, db: Db = getDb()): Promise<void> {
  // enqueueMerge is a no-op at the DB level — the worktree is already marked
  // ready_for_merge. This function exists so callers can set a priority hint
  // in the future. For now it validates the worktree exists and is in the
  // correct state before returning.
  const row = db
    .prepare(`SELECT status FROM worktrees WHERE worktree_id = ?`)
    .get(input.worktree_id) as { status: string } | undefined

  if (!row) throw new Error(`Worktree not found: ${input.worktree_id}`)
  if (row.status !== 'ready_for_merge') {
    throw new Error(
      `Cannot enqueue worktree ${input.worktree_id}: status is '${row.status}', expected 'ready_for_merge'`
    )
  }
}

// --- H-4: real git merge queue ---------------------------------------------

export interface ProcessMergeQueueInput {
  /** Limit to a single workspace (preferred). If omitted, scoped by project_id. */
  workspace_id?: string
  /** Optional additional filter. */
  project_id?: string
  /** Role of the caller — must satisfy canMerge(). */
  actor_role: string
  /** Actor id for event attribution (defaults to actor_role). */
  actor_id?: string
}

export interface ProcessMergeQueueResult {
  /** worktree_ids that were successfully merged. */
  merged: string[]
  /** worktree_ids that were skipped because merge gates weren't satisfied. */
  skipped: string[]
  /** worktree_ids that were left in status='conflict'. */
  conflicts: string[]
  /** Per-row details for legacy callers. */
  results: MergeResult[]
}

/**
 * Check whether a worktree has the artifact gates required to merge.
 *
 * Spec §17 / H-4 calls for two gate artifacts:
 *
 *   - A `review_report` (a.k.a. review_summary) owned by the worktree
 *   - A `test_report`   (a.k.a. test_run_summary) owned by the worktree
 *
 * The canonical artifacts.status CHECK is ('draft','final','archived').
 * We treat `status='final'` as the "approved / passed" signal — the review
 * or test pipeline must finalize the artifact before the worktree can merge.
 * Draft / archived / missing all fail the gate.
 */
function gateArtifactsSatisfied(
  worktree_id: string,
  db: Db = getDb(),
): { ok: boolean; missing: string[] } {
  const review = db
    .prepare(
      `SELECT status FROM artifacts
       WHERE owner_type = 'worktree' AND owner_id = ? AND artifact_type = 'review_report'
       ORDER BY updated_at DESC LIMIT 1`
    )
    .get(worktree_id) as { status: string } | undefined
  const test = db
    .prepare(
      `SELECT status FROM artifacts
       WHERE owner_type = 'worktree' AND owner_id = ? AND artifact_type = 'test_report'
       ORDER BY updated_at DESC LIMIT 1`
    )
    .get(worktree_id) as { status: string } | undefined

  const missing: string[] = []
  if (!review || review.status !== 'final') missing.push('review_report')
  if (!test || test.status !== 'final') missing.push('test_report')
  return { ok: missing.length === 0, missing }
}

/**
 * Best-effort event emitter. The worktrees package is a leaf package that
 * may be used in environments where the `events` table (owned by fulcrum-agent-core
 * migrations) isn't present — e.g. the standalone worktrees test DB. Swallow
 * errors so callers never see an events-table failure bubble up from a merge.
 */
function safeEmit(input: Parameters<typeof emitEvent>[0]): void {
  try {
    emitEvent(input)
  } catch {
    /* best-effort — events table may not exist in this DB */
  }
}

async function safeStartSpan(input: Parameters<typeof startSpan>[0]): Promise<string | undefined> {
  try {
    const span = await startSpan(input)
    return span.span_id
  } catch {
    return undefined
  }
}

async function safeEndSpan(
  span_id: string | undefined,
  status: 'ok' | 'error',
  payload: Record<string, unknown>,
): Promise<void> {
  if (!span_id) return
  try {
    await endSpan({ span_id, status, payload })
  } catch {
    /* best-effort — trace_events table may not exist in this DB */
  }
}

function isCheckConstraintError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? ''
  return msg.includes('CHECK constraint failed') || msg.includes('no such table')
}

/**
 * Process the merge queue. Accepts either the modern input-object form (H-4)
 * or the legacy positional form `(projectId, callerRole)` for backwards
 * compatibility. Returns a `ProcessMergeQueueResult` summary. The legacy
 * array of `MergeResult` is available via the `.results` field.
 */
export async function processMergeQueue(
  input: ProcessMergeQueueInput
): Promise<ProcessMergeQueueResult>
export async function processMergeQueue(
  projectId: string,
  callerRole: string
): Promise<ProcessMergeQueueResult>
export async function processMergeQueue(
  inputOrProjectId: ProcessMergeQueueInput | string,
  callerRole?: string,
  db: Db = getDb(),
): Promise<ProcessMergeQueueResult> {
  const input: ProcessMergeQueueInput =
    typeof inputOrProjectId === 'string'
      ? { project_id: inputOrProjectId, actor_role: callerRole ?? '' }
      : inputOrProjectId

  if (!canMerge(input.actor_role as AgentRole)) {
    throw new FulcrumError(
      `POLICY_DENIED: role '${input.actor_role}' not authorized to merge`,
      'policy_denied'
    )
  }

  const actor_id = input.actor_id ?? input.actor_role

  // FIFO by updated_at (time the worktree entered ready_for_merge).
  const filters: string[] = [`status = 'ready_for_merge'`]
  const params: unknown[] = []
  if (input.workspace_id) {
    filters.push('workspace_id = ?')
    params.push(input.workspace_id)
  }
  if (input.project_id) {
    filters.push('project_id = ?')
    params.push(input.project_id)
  }
  const queue = db
    .prepare(
      `SELECT * FROM worktrees WHERE ${filters.join(' AND ')} ORDER BY updated_at ASC`
    )
    .all(...params) as Array<Record<string, unknown>>

  const merged: string[] = []
  const skipped: string[] = []
  const conflicts: string[] = []
  const results: MergeResult[] = []

  for (const row of queue) {
    const worktree_id = row.worktree_id as string
    const branch_name = row.branch_name as string
    const project_id = row.project_id as string
    const workspace_id = row.workspace_id as string
    const wtPath = row.path as string
    const base_branch = (row.base_branch as string | null) ?? null

    // 1. Gate check — must have review_report + test_report (both 'final').
    const gate = gateArtifactsSatisfied(worktree_id, db)
    if (!gate.ok) {
      skipped.push(worktree_id)
      results.push({
        worktree_id,
        branch_name,
        success: false,
        error: `missing gate artifacts: ${gate.missing.join(', ')}`,
      })
      safeEmit({
        workspace_id,
        project_id,
        evt_type: 'policy_denied',
        object_type: 'worktree',
        object_id: worktree_id,
        actor_type: 'agent',
        actor_id,
        payload: { reason: 'missing_merge_gates', missing: gate.missing },
        severity: 'warn',
      })
      continue
    }

    // 2. Locate project root.
    const projectRoot = projectRootFor(project_id, db)
    const now = new Date().toISOString()

    // 3. Non-git / sequential mode — nothing to merge, just mark merged.
    if (!projectRoot || !isGitRepo(projectRoot) || wtPath === projectRoot) {
      db.prepare(
        `UPDATE worktrees SET status = 'merged', merged_at = ?, updated_at = ? WHERE worktree_id = ?`
      ).run(now, now, worktree_id)
      merged.push(worktree_id)
      results.push({ worktree_id, branch_name, success: true, merged_at: now })
      safeEmit({
        workspace_id,
        project_id,
        evt_type: 'merge_completed',
        object_type: 'worktree',
        object_id: worktree_id,
        actor_type: 'agent',
        actor_id,
        payload: { branch: branch_name, mode: 'sequential' },
      })
      continue
    }

    // 4. Real git merge.
    const agent_role = (row.agent_role as string | undefined) ?? 'agent'
    const msg = `Merge ${agent_role}/${worktree_id.slice(-8)} (${branch_name})`

    safeEmit({
      workspace_id,
      project_id,
      evt_type: 'merge_started',
      object_type: 'worktree',
      object_id: worktree_id,
      actor_type: 'agent',
      actor_id,
      payload: { branch: branch_name, base: base_branch },
    })

    try {
      execFileSync('git', ['merge', '--no-ff', branch_name, '-m', msg], {
        cwd: projectRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (err) {
      const stderr = (err as { stderr?: Buffer | string }).stderr?.toString() ?? ''
      const stdout = (err as { stdout?: Buffer | string }).stdout?.toString() ?? ''
      const combined = `${stderr}\n${stdout}`
      const isConflict =
        combined.includes('CONFLICT') ||
        combined.includes('Automatic merge failed') ||
        combined.toLowerCase().includes('conflict')

      if (isConflict) {
        // Abort the pending merge so the repo stays clean.
        try {
          execFileSync('git', ['merge', '--abort'], {
            cwd: projectRoot,
            stdio: 'ignore',
          })
        } catch {
          /* best-effort */
        }

        // Record a merge_conflict_report artifact. The current artifacts
        // schema doesn't have a `content` column, so we store the diff in a
        // sidecar file under .fulcrum-worktrees/conflicts/ and reference it
        // via file_path. If the artifact insert fails (e.g. CHECK constraint
        // in a stripped-down test DB), we still flip status to 'conflict'.
        try {
          const conflictDir = join(projectRoot, '.fulcrum-worktrees', 'conflicts')
          mkdirSync(conflictDir, { recursive: true })
          const filePath = join(conflictDir, `${worktree_id}.log`)
          writeFileSync(filePath, combined)
          const artifact_id = newId('artifact')
          db.prepare(
            `INSERT INTO artifacts
               (artifact_id, workspace_id, project_id, display_id, artifact_type,
                title, file_path, owner_type, owner_id, status)
             VALUES (?, ?, ?, ?, 'merge_conflict_report', ?, ?, 'worktree', ?, 'final')`
          ).run(
            artifact_id,
            workspace_id,
            project_id,
            `ART-MCR-${worktree_id.slice(-8)}`,
            `Merge conflict: ${branch_name}`,
            filePath,
            worktree_id
          )
        } catch (artifactErr) {
          if (!isCheckConstraintError(artifactErr)) {
            /* swallow — best-effort artifact recording */
          }
        }

        const conflictNow = new Date().toISOString()
        db.prepare(
          `UPDATE worktrees SET status = 'conflict', updated_at = ? WHERE worktree_id = ?`
        ).run(conflictNow, worktree_id)
        conflicts.push(worktree_id)
        results.push({
          worktree_id,
          branch_name,
          success: false,
          error: `merge conflict: ${combined.trim().slice(0, 500)}`,
        })
        safeEmit({
          workspace_id,
          project_id,
          evt_type: 'merge_conflicted',
          object_type: 'worktree',
          object_id: worktree_id,
          actor_type: 'agent',
          actor_id,
          payload: { branch: branch_name, stderr: combined.slice(0, 2000) },
          severity: 'warn',
        })
        continue
      }

      // Non-conflict failure — re-throw with context.
      throw new FulcrumError(
        `git merge failed for ${branch_name}: ${combined.trim() || (err as Error).message}`,
        'git_error'
      )
    }

    // 5. Success path — remove the git worktree dir and mark merged.
    try {
      execFileSync('git', ['worktree', 'remove', '--force', wtPath], {
        cwd: projectRoot,
        stdio: ['ignore', 'ignore', 'pipe'],
      })
    } catch {
      /* best-effort — leave the directory if git already cleaned it */
    }

    const successNow = new Date().toISOString()
    db.prepare(
      `UPDATE worktrees SET status = 'merged', merged_at = ?, updated_at = ? WHERE worktree_id = ?`
    ).run(successNow, successNow, worktree_id)
    merged.push(worktree_id)
    results.push({ worktree_id, branch_name, success: true, merged_at: successNow })
    safeEmit({
      workspace_id,
      project_id,
      evt_type: 'merge_completed',
      object_type: 'worktree',
      object_id: worktree_id,
      actor_type: 'agent',
      actor_id,
      payload: { branch: branch_name, message: msg },
    })
  }

  return { merged, skipped, conflicts, results }
}

export async function discardWorktree(input: DiscardWorktreeInput, db: Db = getDb()): Promise<void> {
  const now = new Date().toISOString()

  const current = db
    .prepare('SELECT status FROM worktrees WHERE worktree_id = ?')
    .get(input.worktree_id) as { status: string } | undefined

  if (!current) throw new FulcrumError(`Worktree not found: ${input.worktree_id}`, 'not_found')
  if (current.status === 'merged' || current.status === 'discarded') {
    throw new FulcrumError(
      `Cannot discard worktree ${input.worktree_id}: status is already '${current.status}'`,
      'invalid_state'
    )
  }

  db.prepare(`
    UPDATE worktrees
    SET status = 'discarded', discarded_at = ?, updated_at = ?
    WHERE worktree_id = ?
  `).run(now, now, input.worktree_id)
}

export interface CleanupAbandonedWorktreesInput {
  /** TTL in seconds. Worktrees older than this with cleanup-eligible status are removed. */
  ttl_sec?: number
}

/**
 * Remove worktree rows whose status indicates completion/abandonment AND whose
 * updated_at is older than the TTL. The git worktree directory is NOT touched
 * here — that's a separate concern (H-3 deferred). This just reaps DB state
 * so the merge queue and board views stop listing stale rows.
 *
 * Spec §18.6 — janitor reaps abandoned worktrees (H-10).
 */
export async function cleanupAbandonedWorktrees(
  input: CleanupAbandonedWorktreesInput = {},
  db: Db = getDb(),
): Promise<number> {
  const ttl_sec = input.ttl_sec ?? 24 * 60 * 60 // default 24h
  const cutoff = new Date(Date.now() - ttl_sec * 1000).toISOString()
  const result = db
    .prepare(
      `DELETE FROM worktrees
       WHERE status IN ('discarded','merged') AND updated_at < ?`
    )
    .run(cutoff)
  return result.changes
}

export async function listMergeQueue(projectId: string, db: Db = getDb()): Promise<Worktree[]> {
  const rows = db
    .prepare(`
      SELECT * FROM worktrees
      WHERE project_id = ? AND status = 'ready_for_merge'
      ORDER BY created_at ASC
    `)
    .all(projectId) as Array<Record<string, unknown>>

  return rows.map(rowToWorktree)
}
