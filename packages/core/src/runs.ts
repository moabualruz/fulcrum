import { execSync } from 'child_process'
import { getDb } from './db/client.js'
import { newId, nextDisplayId } from './ids.js'
import { statusCategory } from './status-category.js'
import { emitEvent } from './events.js'
import { createTask } from './tasks.js'
import { FulcrumError } from './types.js'
import type { AgentRun, AgentRole, AgentRunStatus, RunArtifacts, Task } from './types.js'

interface StartRunInput {
  task_id: string
  workspace_id: string
  role: AgentRole
  agent_id?: string
  pi_profile?: string
  git_branch?: string
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
export async function startAgentRun(input: StartRunInput): Promise<AgentRun> {
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
        finished_at = ?, completed_at = ?, updated_at = ?, version = version + 1
    WHERE run_id = ?
  `).run(
    doneCategory,
    input.output_summary,
    input.artifacts ? JSON.stringify(input.artifacts) : null,
    now, now, now, input.run_id
  )

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

  return getRun(input.run_id)
}

export async function blockAgentRun(input: BlockRunInput): Promise<AgentRun> {
  if (!input.reason.trim()) throw new FulcrumError('reason must not be empty', 'invalid_input')
  const run = getRun(input.run_id) // throws not_found before any mutation
  const db = getDb()
  const blockedCategory = statusCategory('blocked')
  db.prepare(`
    UPDATE agent_runs
    SET status = 'blocked', status_category = ?, blocker = ?, output_summary = ?,
        updated_at = ?, version = version + 1
    WHERE run_id = ?
  `).run(blockedCategory, input.reason, input.reason, new Date().toISOString(), input.run_id)

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

  return getRun(input.run_id)
}

export async function escalateRun(input: EscalateRunInput): Promise<Task> {
  if (!input.escalation_reason.trim()) throw new FulcrumError('escalation_reason must not be empty', 'invalid_input')
  const db = getDb()
  const run = getRun(input.run_id)

  db.prepare(`
    UPDATE agent_runs SET status = 'aborted', status_category = 'done', updated_at = ?, version = version + 1
    WHERE run_id = ?
  `).run(new Date().toISOString(), input.run_id)

  const taskRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?')
    .get(run.task_id) as Record<string, unknown> | undefined
  if (!taskRow) throw new FulcrumError(`Task ${run.task_id} not found during escalation`, 'not_found')

  return createTask({
    workspace_id: run.workspace_id,
    project_id: taskRow.project_id as string,
    title: `Escalation: ${taskRow.title as string} (run ${run.run_id})`,
    description: `Run ${run.run_id} (role: ${run.role}) was escalated.\n\nReason: ${input.escalation_reason}`,
    assigned_to: 'chief_of_staff',
  })
}
