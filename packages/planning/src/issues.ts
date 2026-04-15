// packages/planning/src/issues.ts
import { getDb, FulcrumError, emitEvent, nextDisplayId, statusCategory, newId, Db} from '@fulcrum/core'
import type { Issue, CreateIssueInput, UpdateIssueInput, ListIssuesInput, IssueStatus, StatusCategory, EstimateType } from './types.js'

// PLAN-005: allowed status transitions — enforced in updateIssue
const ISSUE_TRANSITIONS: Record<IssueStatus, readonly IssueStatus[]> = {
  backlog:     ['ready', 'in_progress', 'done', 'cancelled'],
  ready:       ['in_progress', 'backlog', 'done', 'cancelled'],
  in_progress: ['in_review', 'blocked', 'done', 'cancelled', 'backlog'],
  blocked:     ['in_progress', 'cancelled'],
  in_review:   ['in_progress', 'done', 'cancelled'],
  done:        ['cancelled'],
  cancelled:   [],
}

function rowToIssue(row: Record<string, unknown>, labels: string[]): Issue {
  return {
    issue_id: row.issue_id as string,
    workspace_id: row.workspace_id as string,
    project_id: row.project_id as string,
    epic_id: row.epic_id as string | null,
    parent_issue_id: row.parent_issue_id as string | null,
    blocking_task_id: (row.blocking_task_id ?? null) as string | null, // PLAN-003
    blocking_issue_id: (row.blocking_issue_id ?? null) as string | null, // PLAN-003
    display_id: row.display_id as string,
    title: row.title as string,
    description: row.description as string | null,
    status: row.status as IssueStatus,
    status_category: row.status_category as StatusCategory,
    priority: row.priority as Issue['priority'],
    assignee_agent_id: row.assignee_agent_id as string | null,
    estimate_type: row.estimate_type as EstimateType | null,
    estimate_value: row.estimate_value as number | null,
    labels,
    version: row.version as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

function getLabels(db: ReturnType<typeof getDb>, issue_id: string): string[] {
  const rows = db.prepare('SELECT label FROM issue_labels WHERE issue_id = ? ORDER BY added_at ASC')
    .all(issue_id) as Array<{ label: string }>
  return rows.map(r => r.label)
}

export async function createIssue(input: CreateIssueInput, db: Db = getDb()): Promise<Issue> {
  if (!input.title.trim()) throw new FulcrumError('title must not be empty', 'invalid_input')
  const issue_id = newId('issue')
  const now = new Date().toISOString()
  const priority = input.priority ?? 'medium'
  const status: IssueStatus = 'backlog'
  const status_cat = statusCategory(status)
  const display_id = nextDisplayId('issue', input.project_id, db)

  db.prepare(`
    INSERT INTO issues
      (issue_id, workspace_id, project_id, epic_id, parent_issue_id, display_id,
       title, description, status, status_category, priority, assignee_agent_id,
       estimate_type, estimate_value, blocking_issue_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    issue_id, input.workspace_id, input.project_id,
    input.epic_id ?? null, input.parent_issue_id ?? null, display_id,
    input.title, input.description ?? null, status, status_cat, priority,
    input.assignee_agent_id ?? null,
    input.estimate_type ?? null, input.estimate_value ?? null,
    input.blocking_issue_id ?? null,
    now, now
  )

  emitEvent({
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    evt_type: 'issue_created',
    object_type: 'issue',
    object_id: issue_id,
    actor_type: 'system',
    actor_id: 'system',
    payload: { title: input.title },
  })

  const row = db.prepare('SELECT * FROM issues WHERE issue_id = ?').get(issue_id) as Record<string, unknown>
  return rowToIssue(row, [])
}

export async function updateIssue(input: UpdateIssueInput, db: Db = getDb()): Promise<Issue> {
  const existing = db.prepare('SELECT * FROM issues WHERE issue_id = ? AND workspace_id = ?')
    .get(input.issue_id, input.workspace_id) as Record<string, unknown> | undefined
  if (!existing) throw new FulcrumError(`Issue ${input.issue_id} not found`, 'not_found')

  if ((existing.version as number) !== input.expected_version) {
    throw new FulcrumError(
      `Version conflict: expected ${input.expected_version}, got ${existing.version as number}`,
      'version_conflict'
    )
  }

  const fields: string[] = ['version = version + 1', 'updated_at = ?']
  const values: unknown[] = [new Date().toISOString()]
  if (input.title !== undefined) { fields.push('title = ?'); values.push(input.title) }
  if (input.description !== undefined) { fields.push('description = ?'); values.push(input.description) }
  if (input.priority !== undefined) { fields.push('priority = ?'); values.push(input.priority) }
  if (input.assignee_agent_id !== undefined) { fields.push('assignee_agent_id = ?'); values.push(input.assignee_agent_id) }
  if (input.estimate_type !== undefined) { fields.push('estimate_type = ?'); values.push(input.estimate_type) }
  if (input.estimate_value !== undefined) { fields.push('estimate_value = ?'); values.push(input.estimate_value) }

  const statusChanging = input.status !== undefined && input.status !== (existing.status as string)

  if (input.status !== undefined) {
    // PLAN-005: validate transition is allowed
    if (statusChanging) {
      const from = existing.status as IssueStatus
      const allowed = ISSUE_TRANSITIONS[from] ?? []
      if (!(allowed as readonly string[]).includes(input.status)) {
        throw new FulcrumError(
          `Invalid issue status transition: ${from} → ${input.status}`,
          'invalid_state'
        )
      }
    }
    fields.push('status = ?'); values.push(input.status)
    fields.push('status_category = ?'); values.push(statusCategory(input.status))
  }

  // PLAN-003: update blocking_task_id if provided
  if ('blocking_task_id' in input) {
    fields.push('blocking_task_id = ?'); values.push(input.blocking_task_id ?? null)
  }
  // PLAN-003: update blocking_issue_id if provided
  if ('blocking_issue_id' in input) {
    fields.push('blocking_issue_id = ?'); values.push(input.blocking_issue_id ?? null)
  }
  values.push(input.issue_id)

  db.prepare(`UPDATE issues SET ${fields.join(', ')} WHERE issue_id = ?`).run(...values)

  // Replace labels if provided
  if (input.labels !== undefined) {
    db.prepare('DELETE FROM issue_labels WHERE issue_id = ?').run(input.issue_id)
    const insertLabel = db.prepare('INSERT INTO issue_labels (issue_id, label) VALUES (?, ?)')
    for (const label of input.labels) {
      insertLabel.run(input.issue_id, label)
    }
  }

  if (statusChanging) {
    emitEvent({
      workspace_id: existing.workspace_id as string,
      project_id: existing.project_id as string,
      evt_type: 'issue_status_changed',
      object_type: 'issue',
      object_id: input.issue_id,
      actor_type: 'system',
      actor_id: 'planning',
      payload: { from_status: existing.status as string, to_status: input.status as string },
    })
  }

  const updated = db.prepare('SELECT * FROM issues WHERE issue_id = ?').get(input.issue_id) as Record<string, unknown>
  const labels = getLabels(db, input.issue_id)
  return rowToIssue(updated, labels)
}

export async function listIssues(input: ListIssuesInput, db: Db = getDb()): Promise<Issue[]> {
  let sql = 'SELECT * FROM issues WHERE workspace_id = ?'
  const params: unknown[] = [input.workspace_id]
  if (input.project_id) { sql += ' AND project_id = ?'; params.push(input.project_id) }
  if (input.epic_id) { sql += ' AND epic_id = ?'; params.push(input.epic_id) }
  if (input.parent_issue_id) { sql += ' AND parent_issue_id = ?'; params.push(input.parent_issue_id) }
  if (input.status) { sql += ' AND status = ?'; params.push(input.status) }
  if (input.status_category) { sql += ' AND status_category = ?'; params.push(input.status_category) }
  if (input.assignee_agent_id) { sql += ' AND assignee_agent_id = ?'; params.push(input.assignee_agent_id) }
  sql += ' ORDER BY created_at ASC'
  // PLAN-007: pagination
  sql += ' LIMIT ? OFFSET ?'
  params.push(input.limit ?? 100)
  params.push(input.offset ?? 0)
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  const issueIds = rows.map(r => r.issue_id as string)
  if (issueIds.length === 0) return []
  const labelRows = db.prepare(
    `SELECT issue_id, label FROM issue_labels WHERE issue_id IN (${issueIds.map(() => '?').join(',')}) ORDER BY added_at ASC`
  ).all(...issueIds) as Array<{ issue_id: string; label: string }>
  const labelMap = new Map<string, string[]>()
  for (const lr of labelRows) {
    const arr = labelMap.get(lr.issue_id) ?? []
    arr.push(lr.label)
    labelMap.set(lr.issue_id, arr)
  }
  return rows.map(row => rowToIssue(row, labelMap.get(row.issue_id as string) ?? []))
}
