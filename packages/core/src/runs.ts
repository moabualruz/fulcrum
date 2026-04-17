import { execSync } from 'child_process'
import { getDb , Db} from './db/client.js'
import { newId, nextDisplayId } from './ids.js'
import { statusCategory } from './status-category.js'
import { emitEvent } from './events.js'
import { createTask } from './tasks.js'
import { writeLifecycleMemory, type LifecycleMemoryInput } from './memory-insert.js'
import { getAgentDefinition } from './agent-definitions.js'
import { FulcrumError } from './types.js'
import { notifyBlocked } from './notify.js'
import type { AgentRun, AgentRole, AgentRunStatus, RunArtifacts, RunEvent, Task, TaskPacket, SpawnableRun, StartAgentRunInput } from './types.js'

/**
 * Recall task-scoped memories at run start so the agent sees prior context
 * (task_goal, task_decision, task_outcome, lessons) in the initial event.
 * Non-throwing: a recall failure must never prevent a run from starting.
 *
 * Uses a direct task_id query (not FTS5 MATCH) because `recallMemory` requires
 * a text query that matches content, whereas at run start we want *all*
 * decision/lesson rows for this task regardless of wording.
 *
 * Returns a compact `{memory_id, kind, content}` summary list (top 5 by
 * recency + importance, filtered to the relevant kinds).
 */
function recallTaskContext(opts: {
  workspace_id: string
  project_id: string | null
  task_id: string | null
}, db: Db = getDb()): Array<{ memory_id: string; kind: string; content: string }> {
  if (!opts.task_id) return []
  try {
    const rows = db.prepare(`
      SELECT memory_id, kind, content
      FROM memories
      WHERE workspace_id = ?
        AND task_id = ?
        AND kind IN ('task_goal', 'task_decision', 'decision', 'lesson', 'task_outcome')
      ORDER BY importance DESC, created_at DESC
      LIMIT 5
    `).all(opts.workspace_id, opts.task_id) as Array<{
      memory_id: string
      kind: string
      content: string
    }>
    return rows.map(r => ({
      memory_id: r.memory_id,
      kind: r.kind,
      content: (r.content || '').slice(0, 400),
    }))
  } catch {
    return []
  }
}

/**
 * Wrap writeLifecycleMemory in a non-throwing facade so lifecycle transitions
 * never fail on a memory write. Errors are logged to stderr for ops visibility.
 */
async function safeWriteMemory(input: LifecycleMemoryInput): Promise<void> {
  try {
    await writeLifecycleMemory(input)
  } catch (err) {
    process.stderr.write(`[runs] auto-write memory failed: ${(err as Error).message}\n`)
  }
}
interface HeartbeatInput {
  run_id: string
  current_step: string
  progress_pct: number
  current_path?: string
}
interface GetStatusInput { run_id: string }
interface CompleteRunInput {
  run_id: string
  output_summary: string
  artifacts?: RunArtifacts
}
interface BlockRunInput { run_id: string; reason: string; escalation_reason?: string }
interface EscalateRunInput { run_id: string; escalation_reason: string }

// Keep RunStatus as alias for backward compat
export type RunStatus = AgentRunStatus

const DEFAULT_TERMINAL = new Set(['finished', 'aborted', 'failed'])

function assertRunIsLive(
  run: { status: string },
  run_id: string,
  terminal: Set<string> = DEFAULT_TERMINAL,
): void {
  if (terminal.has(run.status)) {
    throw new FulcrumError(
      `Run ${run_id} is already in terminal state '${run.status}'`,
      'invalid_state'
    )
  }
}

/**
 * Append a structured event to run_events table (replaces the JSON blob approach).
 * Each row has shape { id, run_id, ts, event_type, payload } and records a lifecycle
 * transition: started, heartbeat, completed, blocked, escalated.
 * `undefined` payload fields are stripped for clean JSON.
 */
function appendRunEvent(
  run_id: string,
  event_type: string,
  payload: Record<string, unknown> = {},
  db: Db = getDb(),
): void {
  const id = newId('run_event')
  const ts = new Date().toISOString()
  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined))
  db.prepare(
    'INSERT INTO run_events (id, run_id, ts, event_type, payload) VALUES (?, ?, ?, ?, ?)'
  ).run(id, run_id, ts, event_type, JSON.stringify(clean))
}

/**
 * Get the full event history for a run, ordered by ts ASC.
 */
export function getRunHistory(run_id: string, db: Db = getDb()): RunEvent[] {
  return db.prepare(
    'SELECT id, run_id, ts, event_type, payload FROM run_events WHERE run_id = ? ORDER BY ts ASC'
  ).all(run_id) as RunEvent[]
}

function upsertAgentStateProjection(db: ReturnType<typeof getDb>, run: AgentRun): void {
  db.prepare(`
    INSERT OR REPLACE INTO agent_state_projection
      (run_id, workspace_id, project_id, agent_id, agent_role, pi_profile, status,
       task_id, current_step, current_path, progress_pct, heartbeat_at, blocker,
       worktree_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    run.run_id, run.workspace_id, run.project_id ?? null, run.agent_id ?? null,
    run.role, run.pi_profile ?? null, run.status,
    run.task_id ?? null, run.current_step ?? null, run.current_path ?? null,
    run.progress_pct ?? null, run.heartbeat_at ?? null, run.blocker ?? null,
    run.worktree_id ?? null, run.updated_at
  )
}

function captureGitContext(): { git_branch: string | null; git_commit: string | null } {
  try {
    const opts = { stdio: ['ignore', 'pipe', 'ignore'] as ['ignore', 'pipe', 'ignore'], timeout: 3000 }
    const branch = execSync('git rev-parse --abbrev-ref HEAD', opts).toString().trim()
    const commit = execSync('git rev-parse HEAD', opts).toString().trim()
    return { git_branch: branch === 'HEAD' ? null : branch, git_commit: commit }
  } catch {
    return { git_branch: null, git_commit: null }
  }
}

export function rowToRun(row: Record<string, unknown>): AgentRun {
  return {
    run_id: row.run_id as string,
    task_id: row.task_id as string,
    workspace_id: row.workspace_id as string,
    project_id: (row.project_id as string) || '',
    display_id: (row.display_id as string) || '',
    agent_id: (row.agent_id as string) || '',
    role: row.role as AgentRole,
    pi_profile: (row.pi_profile as string | null) ?? null,
    status: row.status as AgentRunStatus,
    status_category: ((row.status_category as string) || statusCategory(row.status as string)) as AgentRun['status_category'],
    current_step: row.current_step as string | null,
    current_path: (row.current_path as string | null) ?? null,
    progress_pct: row.progress_pct as number,
    output_summary: row.output_summary as string | null,
    artifacts: row.artifacts
      ? ((): RunArtifacts => { try { return JSON.parse(row.artifacts as string) as RunArtifacts } catch { return {} } })()
      : null,
    git_branch: row.git_branch as string | null,
    git_commit: row.git_commit as string | null,
    heartbeat_at: (row.heartbeat_at as string | null) ?? null,
    blocker: (row.blocker as string | null) ?? null,
    worktree_id: (row.worktree_id as string | null) ?? null,
    version: row.version as number,
    context_type: ((row.context_type as string) || 'primary') as AgentRun['context_type'],
    parent_run_id: (row.parent_run_id as string | null) ?? null,
    started_at: row.started_at as string,
    updated_at: row.updated_at as string,
    finished_at: (row.finished_at as string | null) ?? null,
  }
}

function getRun(run_id: string, db: Db = getDb()): AgentRun {
  const row = db.prepare('SELECT * FROM agent_runs WHERE run_id = ?').get(run_id) as Record<string, unknown> | undefined
  if (!row) throw new FulcrumError(`Run ${run_id} not found`, 'not_found')
  return rowToRun(row)
}

/**
 * Creates a new agent run for the given task.
 * NOTE: WIP limit and dependency enforcement is the caller's responsibility —
 * callers should call `checkPolicy` first and only proceed if `allowed: true`.
 */
export async function startAgentRun(input: StartAgentRunInput, db: Db = getDb()): Promise<AgentRun> {
  // v2a PR 1 Task 3 + PR 6: strict enforcement — context_type must be supplied.
  // Callers must pass one of the allowed values; omission is an error.
  const allowedContextTypes = new Set(['primary', 'subagent', 'cron', 'heartbeat', 'flush'])
  if (!input.context_type) {
    throw new FulcrumError(
      `startAgentRun requires context_type (one of: ${[...allowedContextTypes].join(', ')}). role=${input.role} task_id=${input.task_id}`,
      'invalid_input',
    )
  }
  const contextType = input.context_type
  if (!allowedContextTypes.has(contextType)) {
    throw new FulcrumError(`unknown context_type: ${contextType}`, 'invalid_input')
  }

  // v2a PR 9 Task 45: opportunistic session-scope sweep — cheap predicate-
  // indexed DELETE that bounds row accumulation between MCP restarts. Lazy
  // string-import keeps the dep direction memory → core only.
  try {
    const moduleName = 'fulcrum-memory'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const memoryPkg = (await import(/* @vite-ignore */ moduleName)) as any
    if (typeof memoryPkg?.opportunisticSweep === 'function') memoryPkg.opportunisticSweep(db)
  } catch { /* sweep is best-effort */ }

  const taskRow = db.prepare('SELECT workspace_id, project_id FROM tasks WHERE task_id = ?')
    .get(input.task_id) as { workspace_id: string; project_id: string } | undefined
  if (!taskRow) throw new FulcrumError(`Task ${input.task_id} not found`, 'not_found')
  if (taskRow.workspace_id !== input.workspace_id) {
    throw new FulcrumError(
      `Task ${input.task_id} belongs to workspace ${taskRow.workspace_id}, not ${input.workspace_id}`,
      'invalid_input'
    )
  }
  const run_id = newId('run')
  const now = new Date().toISOString()
  const { git_branch, git_commit } = captureGitContext()
  const display_id = nextDisplayId('run', taskRow.project_id, db)
  const agent_id = input.agent_id ?? ''
  const initialStatus = 'running'
  const sc = statusCategory(initialStatus)

  db.prepare(`
    INSERT INTO agent_runs
      (run_id, task_id, workspace_id, project_id, display_id, agent_id, role, pi_profile,
       status, status_category, git_branch, git_commit, context_type, parent_run_id, started_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    run_id, input.task_id, input.workspace_id, taskRow.project_id,
    display_id, agent_id, input.role, input.pi_profile ?? null,
    initialStatus, sc, git_branch, git_commit,
    contextType, input.parent_run_id ?? null,
    now, now
  )

  // Recall task-scoped memories so the agent sees prior context at startup.
  // Non-blocking — a recall failure must never prevent a run from starting.
  const recalled = recallTaskContext({
    workspace_id: input.workspace_id,
    project_id: taskRow.project_id ?? null,
    task_id: input.task_id ?? null,
  })

  // Resolve agent definition for this role (non-blocking — missing definition is fine)
  const agentDef = (() => { try { return getAgentDefinition(input.role) } catch { return null } })()

  appendRunEvent(run_id, 'started', {
    agent_role: input.role,
    task_id: input.task_id,
    agent_id: agent_id || undefined,
    pi_profile: input.pi_profile,
    recalled_memories: recalled,
    resolved_model: agentDef?.model ?? undefined,
    resolved_executor_uri: agentDef?.executor_uri ?? undefined,
  }, db)

  const startedRun = getRun(run_id, db)
  upsertAgentStateProjection(db, startedRun)

  emitEvent({
    workspace_id: input.workspace_id,
    project_id: taskRow.project_id,
    evt_type: 'agent_run_created',
    object_type: 'agent_run',
    object_id: run_id,
    actor_type: 'agent',
    actor_id: agent_id || 'system',
    payload: { display_id, role: input.role, task_id: input.task_id },
  })
  emitEvent({
    workspace_id: input.workspace_id,
    project_id: taskRow.project_id,
    evt_type: 'agent_run_started',
    object_type: 'agent_run',
    object_id: run_id,
    actor_type: 'agent',
    actor_id: agent_id || 'system',
    payload: { display_id, role: input.role },
  })

  // v2a PR 4 Task 20: PCI lifecycle integration — ensure() per run.
  // Lazy string-import keeps dep direction memory → core; failures are silent.
  try {
    const moduleName = 'fulcrum-memory'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = (await import(/* @vite-ignore */ moduleName)) as any
    if (typeof mem?.onAgentRunStart === 'function') {
      mem.onAgentRunStart({ run_id, project_id: taskRow.project_id, db })
    }
  } catch { /* PCI lifecycle is best-effort */ }

  return getRun(run_id, db)
}

export async function heartbeatAgentRun(input: HeartbeatInput, db: Db = getDb()): Promise<void> {
  const existing = getRun(input.run_id, db) // throws not_found before any mutation
  assertRunIsLive(existing, input.run_id)
  if (input.progress_pct < 0 || input.progress_pct > 100) {
    throw new FulcrumError('progress_pct must be between 0 and 100', 'invalid_input')
  }
  const now = new Date().toISOString()
  const result = db.prepare(`
    UPDATE agent_runs
    SET current_step = ?, progress_pct = ?, heartbeat_at = ?,
        current_path = COALESCE(?, current_path),
        updated_at = ?, version = version + 1
    WHERE run_id = ?
  `).run(
    input.current_step, input.progress_pct, now,
    input.current_path ?? null,
    now, input.run_id
  )
  if (result.changes === 0) throw new FulcrumError(`Run ${input.run_id} not found`, 'not_found')
  appendRunEvent(input.run_id, 'heartbeat', {
    current_step: input.current_step,
    progress_pct: input.progress_pct,
    current_path: input.current_path,
  }, db)
  const heartbeatRun = getRun(input.run_id, db)
  upsertAgentStateProjection(db, heartbeatRun)
}

export async function getAgentRunStatus(input: GetStatusInput, db: Db = getDb()): Promise<AgentRun> {
  return getRun(input.run_id, db)
}

/**
 * Marks an agent run as finished. Does NOT automatically advance the task status —
 * callers (typically the CoS or CLI) are responsible for calling `updateTask`
 * to move the task to 'completed' when all runs for it are done.
 */
export async function completeAgentRun(input: CompleteRunInput, db: Db = getDb()): Promise<AgentRun> {
  const run = getRun(input.run_id, db) // throws not_found before any mutation
  assertRunIsLive(run, input.run_id)
  const now = new Date().toISOString()
  const doneCategory = statusCategory('finished')
  db.prepare(`
    UPDATE agent_runs
    SET status = 'finished', status_category = ?, output_summary = ?, artifacts = ?,
        finished_at = ?, updated_at = ?, version = version + 1
    WHERE run_id = ?
  `).run(
    doneCategory,
    input.output_summary,
    input.artifacts ? JSON.stringify(input.artifacts) : null,
    now, now, input.run_id
  )

  appendRunEvent(input.run_id, 'completed', {
    output_summary: input.output_summary,
    artifacts: input.artifacts,
  }, db)

  const completedRun = getRun(input.run_id, db)
  upsertAgentStateProjection(db, completedRun)

  emitEvent({
    workspace_id: run.workspace_id,
    project_id: run.project_id || undefined,
    evt_type: 'agent_run_finished',
    object_type: 'agent_run',
    object_id: input.run_id,
    actor_type: 'agent',
    actor_id: run.agent_id || 'system',
    payload: { output_summary: input.output_summary },
  })

  // Auto-write task_outcome memory when the summary is meaningful (>20 chars).
  // Non-blocking — memory write failures never fail the completion.
  if (
    input.output_summary &&
    input.output_summary.trim().length > 20 &&
    completedRun.task_id
  ) {
    const artifact_paths = input.artifacts?.files_changed ?? []
    await safeWriteMemory({
      workspace_id: completedRun.workspace_id,
      project_id: completedRun.project_id,
      task_id: completedRun.task_id,
      content: input.output_summary,
      kind: 'task_outcome',
      scope: 'task',
      tags: artifact_paths.slice(0, 10),
      source: 'auto',
    })
  }

  // v2a PR 4 Task 20: release PCI lifecycle refcount.
  try {
    const moduleName = 'fulcrum-memory'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = (await import(/* @vite-ignore */ moduleName)) as any
    if (typeof mem?.onAgentRunEnd === 'function') mem.onAgentRunEnd(input.run_id)
  } catch { /* best-effort */ }

  // v2b PR 8 follow-up — auto-fire on_delegation when a subagent completes.
  // Reads parent_run_id off the completed row; the memory package walks the
  // chain to the topmost primary run for attribution.
  if (completedRun.context_type === 'subagent' && completedRun.parent_run_id && input.output_summary) {
    try {
      const moduleName = 'fulcrum-memory'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mem = (await import(/* @vite-ignore */ moduleName)) as any
      if (typeof mem?.onDelegation === 'function') {
        await mem.onDelegation({
          child_run_id: completedRun.run_id,
          parent_run_id: completedRun.parent_run_id,
          task: completedRun.task_id ?? 'unnamed',
          result: input.output_summary,
          artifacts: input.artifacts?.files_changed ?? [],
        })
      }
    } catch { /* non-fatal; hook_invocation_error should surface separately */ }
  }

  return getRun(input.run_id, db)
}

export async function blockAgentRun(input: BlockRunInput, db: Db = getDb()): Promise<AgentRun> {
  if (!input.reason.trim()) throw new FulcrumError('reason must not be empty', 'invalid_input')
  const run = getRun(input.run_id, db) // throws not_found before any mutation
  assertRunIsLive(run, input.run_id, new Set(['finished', 'aborted']))
  const blockedCategory = statusCategory('blocked')
  db.prepare(`
    UPDATE agent_runs
    SET status = 'blocked', status_category = ?, blocker = ?,
        updated_at = ?, version = version + 1
    WHERE run_id = ?
  `).run(blockedCategory, input.reason, new Date().toISOString(), input.run_id)

  appendRunEvent(input.run_id, 'blocked', { reason: input.reason }, db)

  const blockedRun = getRun(input.run_id, db)
  upsertAgentStateProjection(db, blockedRun)

  emitEvent({
    workspace_id: run.workspace_id,
    project_id: run.project_id || undefined,
    evt_type: 'agent_run_blocked',
    object_type: 'agent_run',
    object_id: input.run_id,
    actor_type: 'agent',
    actor_id: run.agent_id || 'system',
    payload: { reason: input.reason },
  })

  // Fire-and-forget block notification (desktop, alerts.log, webhook). Non-blocking.
  notifyBlocked({
    run_id: input.run_id,
    role: blockedRun.role,
    workspace_id: blockedRun.workspace_id,
    reason: input.reason,
    escalation_reason: input.escalation_reason ?? null,
  }).catch((err: Error) => {
    process.stderr.write(`[fulcrum] notification error (non-fatal): ${err.message}\n`)
  })

  // Auto-write a task_failure memory when we have a reason. Non-blocking.
  if (input.reason && input.reason.trim() && blockedRun.task_id) {
    await safeWriteMemory({
      workspace_id: blockedRun.workspace_id,
      project_id: blockedRun.project_id,
      task_id: blockedRun.task_id,
      content: `Blocked: ${input.reason}`,
      kind: 'task_failure',
      scope: 'task',
      source: 'auto',
    })
  }

  // v2a PR 4 Task 20: release PCI lifecycle refcount on block.
  try {
    const moduleName = 'fulcrum-memory'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = (await import(/* @vite-ignore */ moduleName)) as any
    if (typeof mem?.onAgentRunEnd === 'function') mem.onAgentRunEnd(input.run_id)
  } catch { /* best-effort */ }

  return getRun(input.run_id, db)
}

/**
 * Builds a SpawnableRun from an AgentRun and a TaskPacket.
 * This is the typed handoff from Fulcrum → Pi containing everything Pi needs
 * to spawn an agent without reading additional state from the DB.
 *
 * Resolves model, tools_allow, tools_deny, executor_uri, and system_prompt from
 * agent_definitions at build time. Missing definition is fine — fields will be null.
 *
 * @throws FulcrumError('invalid_input') if the run has no pi_profile set.
 */
export function buildSpawnableRun(run: AgentRun, task_packet: TaskPacket): SpawnableRun {
  if (!run.pi_profile) throw new FulcrumError('run has no pi_profile', 'invalid_input')
  const def = (() => { try { return getAgentDefinition(run.role) } catch { return null } })()
  return {
    run_id: run.run_id,
    workspace_id: run.workspace_id,
    role: run.role,
    pi_profile: run.pi_profile,
    task_packet,
    model: def?.model ?? null,
    tools_allow: def?.tools_allow ?? null,
    tools_deny: def?.tools_deny ?? null,
    executor_uri: def?.executor_uri ?? null,
    system_prompt: def?.system_prompt ?? null,
  }
}

/**
 * Abort any agent_run rows that claim status='running' but have gone stale
 * (no heartbeat for more than `stale_minutes` — default 10).
 *
 * Agents that crash without firing their agent_end / session_shutdown hook
 * leave rows stuck at status='running' forever. The cockpit widget then
 * piles up "running" rows on every PI open. This sweep lets the cockpit
 * reap zombies on startup — rows with:
 *   heartbeat_at IS NULL AND started_at  < now - stale_minutes
 *   heartbeat_at IS NOT NULL AND heartbeat_at < now - stale_minutes
 * are flipped to status='aborted', status_category='done'.
 *
 * Returns the list of run_ids that were reaped.
 */
export function sweepStaleRuns(
  input: { workspace_id?: string; stale_minutes?: number },
  db: Db = getDb(),
): { reaped: string[] } {
  const staleMs = Math.max(1, input.stale_minutes ?? 10) * 60_000
  const cutoff = new Date(Date.now() - staleMs).toISOString()
  const now = new Date().toISOString()

  const wsClause = input.workspace_id ? 'AND workspace_id = ?' : ''
  const wsParams: unknown[] = input.workspace_id ? [input.workspace_id] : []

  const selectSql = `
    SELECT run_id FROM agent_runs
    WHERE status = 'running'
      AND (
        (heartbeat_at IS NULL     AND started_at   < ?)
        OR (heartbeat_at IS NOT NULL AND heartbeat_at < ?)
      )
      ${wsClause}
  `
  const rows = db.prepare(selectSql).all(cutoff, cutoff, ...wsParams) as Array<{ run_id: string }>

  const update = db.prepare(`
    UPDATE agent_runs
    SET status = 'aborted', status_category = 'done', updated_at = ?, version = version + 1
    WHERE run_id = ? AND status = 'running'
  `)
  const tx = db.transaction((ids: string[]) => {
    for (const id of ids) update.run(now, id)
  })
  tx(rows.map(r => r.run_id))

  for (const { run_id } of rows) {
    try { appendRunEvent(run_id, 'aborted', { reason: `sweep_stale_runs: stale for >${input.stale_minutes ?? 10} min` }, db) } catch {}
  }

  return { reaped: rows.map(r => r.run_id) }
}

export async function escalateRun(input: EscalateRunInput, db: Db = getDb()): Promise<Task> {
  if (!input.escalation_reason.trim()) throw new FulcrumError('escalation_reason must not be empty', 'invalid_input')
  const run = getRun(input.run_id, db)

  db.prepare(`
    UPDATE agent_runs SET status = 'aborted', status_category = 'done', updated_at = ?, version = version + 1
    WHERE run_id = ?
  `).run(new Date().toISOString(), input.run_id)

  appendRunEvent(input.run_id, 'escalated', { reason: input.escalation_reason }, db)

  const abortedRun = getRun(input.run_id, db)
  upsertAgentStateProjection(db, abortedRun)

  const taskRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?')
    .get(run.task_id) as Record<string, unknown> | undefined
  if (!taskRow) throw new FulcrumError(`Task ${run.task_id} not found during escalation`, 'not_found')

  // Auto-write a task_decision memory capturing the escalation. Non-blocking.
  if (input.escalation_reason && input.escalation_reason.trim() && abortedRun.task_id) {
    await safeWriteMemory({
      workspace_id: abortedRun.workspace_id,
      project_id: (taskRow.project_id as string) || abortedRun.project_id,
      task_id: abortedRun.task_id,
      content: `Escalated to chief_of_staff: ${input.escalation_reason}`,
      kind: 'task_decision',
      scope: 'task',
      source: 'auto',
    })
  }

  return createTask({
    workspace_id: run.workspace_id,
    project_id: taskRow.project_id as string,
    title: `Escalation: ${taskRow.title as string} (run ${run.run_id})`,
    description: `Run ${run.run_id} (role: ${run.role}) was escalated.\n\nReason: ${input.escalation_reason}`,
    assigned_to: 'chief_of_staff',
  })
}
