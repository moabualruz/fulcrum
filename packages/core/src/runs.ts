import { execSync } from 'child_process'
import { ulid } from 'ulid'
import { getDb } from './db/client.js'
import { createTask } from './tasks.js'
import { FulcrumError } from './types.js'
import type { AgentRun, AgentRole, RunStatus, RunArtifacts, Task } from './types.js'

interface StartRunInput {
  task_id: string
  workspace_id: string
  role: AgentRole
}
interface HeartbeatInput {
  run_id: string
  current_step: string
  progress_pct: number
}
interface GetStatusInput { run_id: string }
interface CompleteRunInput {
  run_id: string
  output_summary: string
  artifacts?: RunArtifacts
}
interface BlockRunInput { run_id: string; reason: string }
interface EscalateRunInput { run_id: string; escalation_reason: string }

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
    role: row.role as AgentRole,
    status: row.status as RunStatus,
    current_step: row.current_step as string | null,
    progress_pct: row.progress_pct as number,
    output_summary: row.output_summary as string | null,
    artifacts: row.artifacts ? ((): RunArtifacts => { try { return JSON.parse(row.artifacts as string) as RunArtifacts } catch { return {} } })() : null,
    git_branch: row.git_branch as string | null,
    git_commit: row.git_commit as string | null,
    version: row.version as number,
    started_at: row.started_at as string,
    updated_at: row.updated_at as string,
    completed_at: row.completed_at as string | null,
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
  const taskRow = db.prepare('SELECT workspace_id FROM tasks WHERE task_id = ?')
    .get(input.task_id) as { workspace_id: string } | undefined
  if (!taskRow) throw new FulcrumError(`Task ${input.task_id} not found`, 'not_found')
  if (taskRow.workspace_id !== input.workspace_id) {
    throw new FulcrumError(
      `Task ${input.task_id} belongs to workspace ${taskRow.workspace_id}, not ${input.workspace_id}`,
      'invalid_input'
    )
  }
  const run_id = ulid()
  const now = new Date().toISOString()
  const { git_branch, git_commit } = captureGitContext()
  db.prepare(`
    INSERT INTO agent_runs
      (run_id, task_id, workspace_id, role, git_branch, git_commit, started_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(run_id, input.task_id, input.workspace_id, input.role, git_branch, git_commit, now, now)
  return getRun(run_id)
}

export async function heartbeatAgentRun(input: HeartbeatInput): Promise<void> {
  if (input.progress_pct < 0 || input.progress_pct > 100) {
    throw new FulcrumError('progress_pct must be between 0 and 100', 'invalid_input')
  }
  const db = getDb()
  const result = db.prepare(`
    UPDATE agent_runs
    SET current_step = ?, progress_pct = ?, updated_at = ?, version = version + 1
    WHERE run_id = ?
  `).run(input.current_step, input.progress_pct, new Date().toISOString(), input.run_id)

  if (result.changes === 0) throw new FulcrumError(`Run ${input.run_id} not found`, 'not_found')
}

export async function getAgentRunStatus(input: GetStatusInput): Promise<AgentRun> {
  return getRun(input.run_id)
}

/**
 * Marks an agent run as completed. Does NOT automatically advance the task status —
 * callers (typically the CoS or CLI) are responsible for calling `updateTask`
 * to move the task to 'completed' when all runs for it are done.
 */
export async function completeAgentRun(input: CompleteRunInput): Promise<AgentRun> {
  getRun(input.run_id) // throws not_found before any mutation
  const db = getDb()
  const now = new Date().toISOString()
  db.prepare(`
    UPDATE agent_runs
    SET status = 'completed', output_summary = ?, artifacts = ?,
        completed_at = ?, updated_at = ?, version = version + 1
    WHERE run_id = ?
  `).run(
    input.output_summary,
    input.artifacts ? JSON.stringify(input.artifacts) : null,
    now, now, input.run_id
  )
  return getRun(input.run_id)
}

export async function blockAgentRun(input: BlockRunInput): Promise<AgentRun> {
  if (!input.reason.trim()) throw new FulcrumError('reason must not be empty', 'invalid_input')
  getRun(input.run_id) // throws not_found before any mutation
  const db = getDb()
  db.prepare(`
    UPDATE agent_runs
    SET status = 'blocked', output_summary = ?, updated_at = ?, version = version + 1
    WHERE run_id = ?
  `).run(input.reason, new Date().toISOString(), input.run_id)
  return getRun(input.run_id)
}

export async function escalateRun(input: EscalateRunInput): Promise<Task> {
  if (!input.escalation_reason.trim()) throw new FulcrumError('escalation_reason must not be empty', 'invalid_input')
  const db = getDb()
  const run = getRun(input.run_id)

  // Mark run as escalated
  db.prepare(`
    UPDATE agent_runs SET status = 'escalated', updated_at = ?, version = version + 1
    WHERE run_id = ?
  `).run(new Date().toISOString(), input.run_id)

  // Get the original task to find workspace + project
  const taskRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?')
    .get(run.task_id) as Record<string, unknown> | undefined
  if (!taskRow) throw new FulcrumError(`Task ${run.task_id} not found during escalation`, 'not_found')

  // Create a chief_of_staff escalation task
  return createTask({
    workspace_id: run.workspace_id,
    project_id: taskRow.project_id as string,
    title: `Escalation: ${taskRow.title as string} (run ${run.run_id})`,
    description: `Run ${run.run_id} (role: ${run.role}) was escalated.\n\nReason: ${input.escalation_reason}`,
    assigned_to: 'chief_of_staff',
  })
}
