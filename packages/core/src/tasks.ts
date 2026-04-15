import { getDb } from './db/client.js'
import { newId, nextDisplayId } from './ids.js'
import { statusCategory } from './status-category.js'
import { emitEvent } from './events.js'
import { FulcrumError } from './types.js'
import type { Task, TaskStatus } from './types.js'

interface ListTasksInput {
  workspace_id: string
  project_id?: string
  status?: TaskStatus
}

interface CreateTaskInput {
  workspace_id: string
  project_id: string
  title: string
  description?: string
  depends_on?: string[]
  assigned_to?: string
  priority?: 'critical' | 'high' | 'medium' | 'low' | 'none'
  done_criteria?: string
  issue_id?: string
  labels?: string[]
}

interface UpdateTaskInput {
  task_id: string
  status?: TaskStatus
  action?: 'reopen'
  note?: string
  assigned_to?: string
  description?: string
  expected_version?: number
  priority?: 'critical' | 'high' | 'medium' | 'low' | 'none'
  done_criteria?: string
  claimed_at?: string | null
  completed_at?: string | null
  assigned_run_id?: string | null
  labels?: string[]
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  queued:    ['ready', 'claimed', 'running', 'blocked', 'failed', 'completed', 'cancelled'],
  ready:     ['claimed', 'running', 'blocked', 'failed', 'completed', 'cancelled'],
  claimed:   ['running', 'blocked', 'failed', 'completed', 'cancelled'],
  running:   ['blocked', 'failed', 'completed', 'cancelled'],
  blocked:   ['queued', 'ready', 'claimed', 'running', 'failed', 'cancelled'],
  failed:    [],
  completed: [],
  cancelled: [],
}

function rowToTaskBase(row: Record<string, unknown>): Omit<Task, 'labels' | 'blockers'> {
  return {
    task_id: row.task_id as string,
    workspace_id: row.workspace_id as string,
    project_id: row.project_id as string,
    issue_id: (row.issue_id as string | null) ?? null,
    display_id: (row.display_id as string) || '',
    title: row.title as string,
    description: row.description as string | null,
    status: row.status as TaskStatus,
    status_category: ((row.status_category as string) || statusCategory(row.status as string)) as Task['status_category'],
    priority: ((row.priority as string) || 'medium') as Task['priority'],
    estimate_type: (row.estimate_type as Task['estimate_type']) ?? null,
    estimate_value: (row.estimate_value as number | null) ?? null,
    depends_on: (() => { try { return JSON.parse(row.depends_on as string) as string[] } catch { return [] } })(),
    assigned_to: row.assigned_to as string | null,
    note: row.note as string | null,
    done_criteria: (row.done_criteria as string | null) ?? null,
    version: row.version as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    claimed_at: (row.claimed_at as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    assigned_run_id: (row.assigned_run_id as string | null) ?? null,
  }
}

function hydrateTask(db: ReturnType<typeof getDb>, row: Record<string, unknown>): Task {
  const task_id = row.task_id as string
  const labelRows = db.prepare('SELECT label FROM task_labels WHERE task_id = ? ORDER BY label').all(task_id) as { label: string }[]
  const labels = labelRows.map(r => r.label)
  const blockerRows = db.prepare(
    "SELECT task_id FROM task_relations WHERE target_task_id = ? AND relation_type = 'blocks'"
  ).all(task_id) as { task_id: string }[]
  const blockers = blockerRows.map(r => r.task_id)
  return { ...rowToTaskBase(row), labels, blockers }
}

export async function listTasks(input: ListTasksInput, db = getDb()): Promise<Task[]> {
  let sql = 'SELECT * FROM tasks WHERE workspace_id = ?'
  const params: unknown[] = [input.workspace_id]
  if (input.project_id) { sql += ' AND project_id = ?'; params.push(input.project_id) }
  if (input.status) { sql += ' AND status = ?'; params.push(input.status) }
  sql += ' ORDER BY created_at ASC'
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  return rows.map(row => hydrateTask(db, row))
}

export async function createTask(input: CreateTaskInput, db = getDb()): Promise<Task> {
  if (!input.title.trim()) throw new FulcrumError('title must not be empty', 'invalid_input')
  const task_id = newId('task')
  const now = new Date().toISOString()
  const display_id = nextDisplayId('task', input.project_id, db)
  const initialStatus = 'queued'
  const sc = statusCategory(initialStatus)
  const priority = input.priority ?? 'medium'

  const insertTask = db.prepare(`
    INSERT INTO tasks
      (task_id, workspace_id, project_id, display_id, issue_id, title, description,
       status, status_category, priority, depends_on, assigned_to, note, done_criteria,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertLabel = db.prepare('INSERT OR IGNORE INTO task_labels (task_id, label) VALUES (?, ?)')

  const trx = db.transaction(() => {
    insertTask.run(
      task_id,
      input.workspace_id,
      input.project_id,
      display_id,
      input.issue_id ?? null,
      input.title,
      input.description ?? null,
      initialStatus,
      sc,
      priority,
      JSON.stringify(input.depends_on ?? []),
      input.assigned_to ?? null,
      null,
      input.done_criteria ?? null,
      now,
      now
    )
    if (input.labels && input.labels.length > 0) {
      for (const label of input.labels) {
        insertLabel.run(task_id, label)
      }
    }
  })
  trx()

  emitEvent({
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    evt_type: 'task_created',
    object_type: 'task',
    object_id: task_id,
    actor_type: 'system',
    actor_id: 'core',
    payload: { display_id, title: input.title, status: initialStatus },
  })

  const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(task_id) as Record<string, unknown> | undefined
  if (!row) throw new FulcrumError(`Task ${task_id} not found after insert`, 'not_found')
  return hydrateTask(db, row)
}

export async function updateTask(input: UpdateTaskInput, db = getDb()): Promise<Task> {
  const existing = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(input.task_id) as Record<string, unknown> | undefined
  if (!existing) throw new FulcrumError(`Task ${input.task_id} not found`, 'not_found')

  // Handle explicit reopen action — bypasses transition guard for terminal states
  if (input.action === 'reopen') {
    const currentStatus = existing.status as string
    if (currentStatus !== 'completed' && currentStatus !== 'cancelled' && currentStatus !== 'failed') {
      throw new FulcrumError(
        `Cannot reopen task with status '${currentStatus}' — reopen is for terminal tasks only`,
        'invalid_state'
      )
    }
    // Override status to 'queued' for reopen
    input = { ...input, status: 'queued' as TaskStatus }
  } else if (input.status && input.status !== (existing.status as string)) {
    // Validate state transition
    const allowed = VALID_TRANSITIONS[existing.status as string] ?? []
    if (!allowed.includes(input.status)) {
      throw new FulcrumError(
        `Invalid status transition: ${existing.status as string} → ${input.status}`,
        'invalid_state'
      )
    }
  }

  if (input.expected_version !== undefined && existing.version !== input.expected_version) {
    throw new FulcrumError(
      `Version conflict: expected ${input.expected_version}, got ${existing.version as number}`,
      'version_conflict'
    )
  }

  const fields: string[] = ['version = version + 1', 'updated_at = ?']
  const values: unknown[] = [new Date().toISOString()]

  const statusChanging = input.status !== undefined && input.status !== (existing.status as string)

  if (input.status !== undefined) {
    fields.push('status = ?'); values.push(input.status)
    fields.push('status_category = ?'); values.push(statusCategory(input.status))
  }
  if (input.note !== undefined) { fields.push('note = ?'); values.push(input.note) }
  if (input.assigned_to !== undefined) { fields.push('assigned_to = ?'); values.push(input.assigned_to) }
  if (input.description !== undefined) { fields.push('description = ?'); values.push(input.description) }
  if (input.priority !== undefined) { fields.push('priority = ?'); values.push(input.priority) }
  if (input.done_criteria !== undefined) { fields.push('done_criteria = ?'); values.push(input.done_criteria) }
  if (input.claimed_at !== undefined) { fields.push('claimed_at = ?'); values.push(input.claimed_at) }
  if (input.completed_at !== undefined) { fields.push('completed_at = ?'); values.push(input.completed_at) }
  if (input.assigned_run_id !== undefined) { fields.push('assigned_run_id = ?'); values.push(input.assigned_run_id) }

  values.push(input.task_id)
  const updateStmt = db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE task_id = ?`)
  const deleteLabelStmt = db.prepare('DELETE FROM task_labels WHERE task_id = ?')
  const insertLabelStmt = db.prepare('INSERT OR IGNORE INTO task_labels (task_id, label) VALUES (?, ?)')

  const trx = db.transaction(() => {
    updateStmt.run(...values)
    if (input.labels !== undefined) {
      deleteLabelStmt.run(input.task_id)
      for (const label of input.labels) {
        insertLabelStmt.run(input.task_id, label)
      }
    }
  })
  trx()

  if (statusChanging) {
    emitEvent({
      workspace_id: existing.workspace_id as string,
      project_id: existing.project_id as string,
      evt_type: 'task_status_changed',
      object_type: 'task',
      object_id: input.task_id,
      actor_type: 'system',
      actor_id: 'core',
      payload: {
        from_status: existing.status as string,
        to_status: input.status as string,
        to_category: statusCategory(input.status as string),
      },
    })
  }

  const updated = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(input.task_id) as Record<string, unknown> | undefined
  if (!updated) throw new FulcrumError(`Task ${input.task_id} not found after update`, 'not_found')
  return hydrateTask(db, updated)
}
