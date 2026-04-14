import { execSync } from 'child_process'
import { getDb } from './db/client.js'
import { newId, nextDisplayId } from './ids.js'
import { statusCategory } from './status-category.js'
import { emitEvent } from './events.js'
import { createTask } from './tasks.js'
import { writeMemory } from './memory.js'
import { FulcrumError } from './types.js'
import type { AgentRun, AgentRole, AgentRunStatus, RunArtifacts, Task, TaskPacket, SpawnableRun, StartAgentRunInput } from './types.js'

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
}): Array<{ memory_id: string; kind: string; content: string }> {
  if (!opts.task_id) return []
  try {
    const db = getDb()
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
 * Wrap writeMemory in a non-throwing facade so lifecycle transitions never
 * fail on a memory write. Errors are logged to stderr for ops visibility.
 */
async function safeWriteMemory(input: Parameters<typeof writeMemory>[0]): Promise<void> {
  try {
    await writeMemory(input)
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
interface BlockRunInput { run_id: string; reason: string }
interface EscalateRunInput { run_id: string; escalation_reason: string }

// Keep RunStatus as alias for backward compat
export type RunStatus = AgentRunStatus

/**
 * Append a structured event to agent_runs.events (spec §5.3/§16.5/§19).
 * Each entry has shape { ts, event_type, payload } and records a lifecycle
 * transition: started, heartbeat, completed, blocked, escalated. Reads the
 * current JSON array, pushes, and writes back in a single UPDATE. `undefined`
 * payload fields are stripped for clean JSON.
 */
function appendRunEvent(
  run_id: string,
  event_type: string,
  payload: Record<string, unknown> = {},
): void {
  const db = getDb()
  const row = db.prepare('SELECT events FROM agent_runs WHERE run_id = ?').get(run_id) as { events: string | null } | undefined
  if (!row) return
  const events: Array<{ ts: string; event_type: string; payload: Record<string, unknown> }> =
    row.events ? JSON.parse(row.events) : []
  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined))
  events.push({ ts: new Date().toISOString(), event_type, payload: clean })
  db.prepare('UPDATE agent_runs SET events = ? WHERE run_id = ?').run(JSON.stringify(events), run_id)
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
    started_at: row.started_at as string,
    updated_at: row.updated_at as string,
    finished_at: (row.finished_at as string | null) ?? null,
  }
}

function getRun(run_id: string): AgentRun {
  const db = getDb()
  const row = db.prepare('SELECT * FROM agent_runs WHERE run_id = ?').get(run_id) as Record<string, unknown> | undefined
  if (!row) throw new FulcrumError(`Run ${run_id} not found`, 'not_found')
  return rowToRun(row)
}

/**
 * Creates a new agent run for the given task.
 * NOTE: WIP limit and dependency enforcement is the caller's responsibility —
 * callers should call `checkPolicy` first and only proceed if `allowed: true`.
 */
export async function startAgentRun(input: StartAgentRunInput): Promise<AgentRun> {
  const db = getDb()
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
       status, status_category, git_branch, git_commit, started_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    run_id, input.task_id, input.workspace_id, taskRow.project_id,
    display_id, agent_id, input.role, input.pi_profile ?? null,
    initialStatus, sc, git_branch, git_commit, now, now
  )

  // Recall task-scoped memories so the agent sees prior context at startup.
  // Non-blocking — a recall failure must never prevent a run from starting.
  const recalled = recallTaskContext({
    workspace_id: input.workspace_id,
    project_id: taskRow.project_id ?? null,
    task_id: input.task_id,
  })

  appendRunEvent(run_id, 'started', {
    agent_role: input.role,
    task_id: input.task_id,
    agent_id: agent_id || undefined,
    pi_profile: input.pi_profile,
    recalled_memories: recalled,
  })

  const startedRun = getRun(run_id)
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

  return getRun(run_id)
}

export async function heartbeatAgentRun(input: HeartbeatInput): Promise<void> {
  if (input.progress_pct < 0 || input.progress_pct > 100) {
    throw new FulcrumError('progress_pct must be between 0 and 100', 'invalid_input')
  }
  const db = getDb()
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
  })
  const heartbeatRun = getRun(input.run_id)
  upsertAgentStateProjection(db, heartbeatRun)
}

export async function getAgentRunStatus(input: GetStatusInput): Promise<AgentRun> {
  return getRun(input.run_id)
}

/**
 * Marks an agent run as finished. Does NOT automatically advance the task status —
 * callers (typically the CoS or CLI) are responsible for calling `updateTask`
 * to move the task to 'completed' when all runs for it are done.
 */
export async function completeAgentRun(input: CompleteRunInput): Promise<AgentRun> {
  const run = getRun(input.run_id) // throws not_found before any mutation
  const db = getDb()
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
  })

  const completedRun = getRun(input.run_id)
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
    })
  }

  return getRun(input.run_id)
}

export async function blockAgentRun(input: BlockRunInput): Promise<AgentRun> {
  if (!input.reason.trim()) throw new FulcrumError('reason must not be empty', 'invalid_input')
  const run = getRun(input.run_id) // throws not_found before any mutation
  const db = getDb()
  const blockedCategory = statusCategory('blocked')
  db.prepare(`
    UPDATE agent_runs
    SET status = 'blocked', status_category = ?, blocker = ?,
        updated_at = ?, version = version + 1
    WHERE run_id = ?
  `).run(blockedCategory, input.reason, new Date().toISOString(), input.run_id)

  appendRunEvent(input.run_id, 'blocked', { reason: input.reason })

  const blockedRun = getRun(input.run_id)
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

  // Auto-write a task_failure memory when we have a reason. Non-blocking.
  if (input.reason && input.reason.trim() && blockedRun.task_id) {
    await safeWriteMemory({
      workspace_id: blockedRun.workspace_id,
      project_id: blockedRun.project_id,
      task_id: blockedRun.task_id,
      content: `Blocked: ${input.reason}`,
      kind: 'task_failure',
      scope: 'task',
    })
  }

  return getRun(input.run_id)
}

/**
 * Builds a SpawnableRun from an AgentRun and a TaskPacket.
 * This is the typed handoff from Fulcrum → Pi containing everything Pi needs
 * to spawn an agent without reading additional state from the DB.
 *
 * @throws FulcrumError('invalid_input') if the run has no pi_profile set.
 */
export function buildSpawnableRun(run: AgentRun, task_packet: TaskPacket): SpawnableRun {
  if (!run.pi_profile) throw new FulcrumError('run has no pi_profile', 'invalid_input')
  return {
    run_id: run.run_id,
    workspace_id: run.workspace_id,
    role: run.role,
    pi_profile: run.pi_profile,
    task_packet,
  }
}

export async function escalateRun(input: EscalateRunInput): Promise<Task> {
  if (!input.escalation_reason.trim()) throw new FulcrumError('escalation_reason must not be empty', 'invalid_input')
  const db = getDb()
  const run = getRun(input.run_id)

  db.prepare(`
    UPDATE agent_runs SET status = 'aborted', status_category = 'done', updated_at = ?, version = version + 1
    WHERE run_id = ?
  `).run(new Date().toISOString(), input.run_id)

  appendRunEvent(input.run_id, 'escalated', { reason: input.escalation_reason })

  const abortedRun = getRun(input.run_id)
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
