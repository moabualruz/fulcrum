// v2a PR 8 Task 41 — parent-side subagent memory pattern (parent-side subagent memory).
//
// When a child run completes (context_type='subagent') with a non-null
// parent_run_id, this writes a `kind='delegation_summary'` memory attributed
// to the PARENT's scope — the parent gets a record of what its subagent did.
//
// Per critical constraint #6 (subagent memory rules): a child with
// context_type='subagent' cannot write any other kind. This module is the
// only sanctioned write path for non-primary runs.

import type { Db } from 'fulcrum-core'
import { getDb, newId } from 'fulcrum-core'

const SUMMARY_CAP = 800

export interface OnDelegationInput {
  child_run_id: string
  parent_run_id: string
  task: string
  result: string
  artifacts?: string[]
}

export interface OnDelegationResult {
  memory_id: string
  parent_workspace_id: string
  parent_project_id: string | null
}

interface ParentRunRow {
  run_id: string
  workspace_id: string
  project_id: string | null
  task_id: string
  context_type: string | null
}

export async function onDelegation(input: OnDelegationInput, db: Db = getDb()): Promise<OnDelegationResult | null> {
  const parent = db.prepare(
    `SELECT run_id, workspace_id, project_id, task_id, context_type FROM agent_runs WHERE run_id = ?`,
  ).get(input.parent_run_id) as ParentRunRow | undefined
  if (!parent) return null

  // The parent must itself be primary — chained subagents (subagent → subagent)
  // bubble up to the topmost primary run for memory attribution.
  if (parent.context_type && parent.context_type !== 'primary') {
    // Walk up via parent_run_id until we find a primary or run out of chain.
    const chain = db.prepare(`
      WITH RECURSIVE walk(run_id, parent_run_id, context_type, workspace_id, project_id, task_id, depth) AS (
        SELECT run_id, parent_run_id, context_type, workspace_id, project_id, task_id, 0
          FROM agent_runs WHERE run_id = ?
        UNION ALL
        SELECT a.run_id, a.parent_run_id, a.context_type, a.workspace_id, a.project_id, a.task_id, walk.depth + 1
          FROM agent_runs a JOIN walk ON walk.parent_run_id = a.run_id
          WHERE walk.depth < 20
      )
      SELECT run_id, workspace_id, project_id, task_id FROM walk WHERE context_type = 'primary' LIMIT 1
    `).get(input.parent_run_id) as { run_id: string; workspace_id: string; project_id: string | null; task_id: string } | undefined
    if (!chain) return null
    parent.run_id = chain.run_id
    parent.workspace_id = chain.workspace_id
    parent.project_id = chain.project_id
    parent.task_id = chain.task_id
  }

  const summaryParts = [
    `Subagent task: ${input.task}`,
    `Result: ${input.result}`,
  ]
  if (input.artifacts && input.artifacts.length > 0) {
    summaryParts.push(`Artifacts: ${input.artifacts.slice(0, 8).join(', ')}`)
  }
  let summary = summaryParts.join('\n')
  if (summary.length > SUMMARY_CAP) summary = `${summary.slice(0, SUMMARY_CAP - 30)} […truncated]`

  const memory_id = newId('memory')
  const now = new Date().toISOString()
  const provenance = JSON.stringify({
    hook_point: 'on_delegation',
    parent_run_id: parent.run_id,
    child_run_id: input.child_run_id,
    artifacts: input.artifacts ?? [],
  })

  db.prepare(`
    INSERT INTO memories (
      memory_id, workspace_id, project_id, scope, kind, title, summary, content,
      task_id, provenance, slug, vault_path,
      created_at, updated_at, last_accessed_at
    ) VALUES (?, ?, ?, 'project', 'delegation_summary', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    memory_id, parent.workspace_id, parent.project_id, `Subagent: ${input.task.slice(0, 60)}`,
    summary.slice(0, 200), summary,
    parent.task_id, provenance, memory_id, `synthesis/${memory_id}.md`,
    now, now, now,
  )

  return {
    memory_id,
    parent_workspace_id: parent.workspace_id,
    parent_project_id: parent.project_id,
  }
}
