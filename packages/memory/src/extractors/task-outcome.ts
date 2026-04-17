// v2a PR 8 Tasks 39 + 40 — task_outcome / blocker_resolution synthesis.
//
// On update_task(status='completed'), gather the run's relevant memory rows
// and synthesize a `kind='task_outcome'` summary. On status='blocked',
// synthesize a `kind='blocker_resolution'`. Race-guard: the Stop hook
// (PR 6 Task 31) checks for the synthesized row's presence and skips the
// session_summary write if the outcome already exists.

import type { Db } from 'fulcrum-core'
import { getDb, newId } from 'fulcrum-core'

const SUMMARY_CAP = 1500
const REASON_CAP = 1500

export interface SynthesisResult {
  memory_id: string
  kind: 'task_outcome' | 'blocker_resolution'
  summary: string
  files_touched: string[]
}

interface TaskRow {
  task_id: string
  workspace_id: string
  project_id: string
  title: string
  description: string | null
  status: string
}

interface AgentRunRow {
  run_id: string
  task_id: string
  started_at: string
  finished_at: string | null
  output_summary: string | null
  context_type: string | null
}

function loadTask(db: Db, task_id: string): TaskRow | null {
  return db.prepare('SELECT task_id, workspace_id, project_id, title, description, status FROM tasks WHERE task_id = ?').get(task_id) as TaskRow | undefined ?? null
}

function loadRunsForTask(db: Db, task_id: string): AgentRunRow[] {
  return db.prepare('SELECT run_id, task_id, started_at, finished_at, output_summary, context_type FROM agent_runs WHERE task_id = ? ORDER BY started_at').all(task_id) as AgentRunRow[]
}

function gatherRelevantMemories(db: Db, task_id: string, kinds: string[]): { memory_id: string; kind: string; content: string; file_path: string | null }[] {
  if (kinds.length === 0) return []
  const placeholders = kinds.map(() => '?').join(',')
  return db.prepare(
    `SELECT memory_id, kind, content, file_path FROM memories WHERE task_id = ? AND kind IN (${placeholders}) ORDER BY created_at`,
  ).all(task_id, ...kinds) as Array<{ memory_id: string; kind: string; content: string; file_path: string | null }>
}

function distinctFilePaths(memories: { file_path: string | null }[]): string[] {
  const set = new Set<string>()
  for (const m of memories) {
    if (m.file_path) set.add(m.file_path)
  }
  return [...set].sort()
}

function buildOutcomeSummary(task: TaskRow, runs: AgentRunRow[], filePatches: { content: string }[]): string {
  const parts: string[] = []
  parts.push(`Task: ${task.title}`)
  if (task.description) parts.push(`Goal: ${task.description.slice(0, 200)}`)
  if (runs.length > 0) {
    const last = runs[runs.length - 1]!
    if (last.output_summary) parts.push(`Run summary: ${last.output_summary.slice(0, 400)}`)
  }
  if (filePatches.length > 0) parts.push(`File-patch traces: ${filePatches.length} entries.`)
  const out = parts.join('\n')
  return out.length > SUMMARY_CAP ? `${out.slice(0, SUMMARY_CAP - 30)} […truncated]` : out
}

function buildBlockerSummary(task: TaskRow, runs: AgentRunRow[], note: string | null): string {
  const parts: string[] = []
  parts.push(`Task: ${task.title}`)
  if (task.description) parts.push(`Goal: ${task.description.slice(0, 200)}`)
  if (note) parts.push(`Blocker: ${note.slice(0, 800)}`)
  if (runs.length > 0) {
    const last = runs[runs.length - 1]!
    if (last.output_summary) parts.push(`Last run summary: ${last.output_summary.slice(0, 200)}`)
  }
  const out = parts.join('\n')
  return out.length > REASON_CAP ? `${out.slice(0, REASON_CAP - 30)} […truncated]` : out
}

/**
 * Synthesize a task_outcome memory for a completed task. Idempotent —
 * checks for an existing task_outcome row attributed to any of this task's
 * runs and skips if present (race-guard for the Stop hook).
 *
 * Returns null if the synthesis row already exists, or if the task isn't
 * found / has no run rows yet.
 */
export async function synthesizeTaskOutcome(task_id: string, db: Db = getDb()): Promise<SynthesisResult | null> {
  const task = loadTask(db, task_id)
  if (!task) return null
  const runs = loadRunsForTask(db, task_id)

  // Race-guard: skip if a task_outcome / blocker_resolution / session_summary
  // already exists for any run on this task.
  const existing = db.prepare(
    `SELECT memory_id FROM memories WHERE task_id = ? AND kind IN ('task_outcome', 'blocker_resolution', 'session_summary') LIMIT 1`,
  ).get(task_id) as { memory_id: string } | undefined
  if (existing) return null

  const filePatches = gatherRelevantMemories(db, task_id, ['file_patch', 'diff', 'code'])
  const summary = buildOutcomeSummary(task, runs, filePatches)
  const filesTouched = distinctFilePaths(filePatches)

  return insertSynthesisMemory(db, {
    task_id,
    workspace_id: task.workspace_id,
    project_id: task.project_id,
    kind: 'task_outcome',
    title: `Task complete: ${task.title.slice(0, 60)}`,
    summary,
    files_touched: filesTouched,
    last_run_id: runs[runs.length - 1]?.run_id,
  })
}

/**
 * Synthesize a blocker_resolution memory for a blocked task. Same race-guard
 * semantics as synthesizeTaskOutcome.
 */
export async function synthesizeBlockerResolution(task_id: string, db: Db = getDb()): Promise<SynthesisResult | null> {
  const task = loadTask(db, task_id)
  if (!task) return null
  const runs = loadRunsForTask(db, task_id)

  const existing = db.prepare(
    `SELECT memory_id FROM memories WHERE task_id = ? AND kind IN ('task_outcome', 'blocker_resolution', 'session_summary') LIMIT 1`,
  ).get(task_id) as { memory_id: string } | undefined
  if (existing) return null

  const note = db.prepare('SELECT note FROM tasks WHERE task_id = ?').get(task_id) as { note: string | null } | undefined
  const filePatches = gatherRelevantMemories(db, task_id, ['file_patch'])
  const summary = buildBlockerSummary(task, runs, note?.note ?? null)

  return insertSynthesisMemory(db, {
    task_id,
    workspace_id: task.workspace_id,
    project_id: task.project_id,
    kind: 'blocker_resolution',
    title: `Task blocked: ${task.title.slice(0, 60)}`,
    summary,
    files_touched: distinctFilePaths(filePatches),
    last_run_id: runs[runs.length - 1]?.run_id,
  })
}

interface InsertParams {
  task_id: string
  workspace_id: string
  project_id: string
  kind: 'task_outcome' | 'blocker_resolution'
  title: string
  summary: string
  files_touched: string[]
  last_run_id?: string
}

function insertSynthesisMemory(db: Db, p: InsertParams): SynthesisResult {
  const memory_id = newId('memory')
  const now = new Date().toISOString()
  const provenance = JSON.stringify({
    hook_point: `update_task:${p.kind === 'task_outcome' ? 'completed' : 'blocked'}`,
    run_id: p.last_run_id,
    files_touched: p.files_touched,
  })
  db.prepare(`
    INSERT INTO memories (
      memory_id, workspace_id, project_id, scope, kind, title, summary, content,
      task_id, provenance, slug, vault_path,
      created_at, updated_at, last_accessed_at
    ) VALUES (?, ?, ?, 'project', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    memory_id, p.workspace_id, p.project_id, p.kind, p.title, p.summary.slice(0, 200), p.summary,
    p.task_id, provenance, memory_id, `synthesis/${memory_id}.md`,
    now, now, now,
  )

  return {
    memory_id,
    kind: p.kind,
    summary: p.summary,
    files_touched: p.files_touched,
  }
}
