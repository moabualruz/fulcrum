import { ulid } from 'ulid'
import { getDb } from './db/client.js'
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
}

interface UpdateTaskInput {
  task_id: string
  status?: TaskStatus
  note?: string
  assigned_to?: string
  description?: string
  expected_version?: number
}

function rowToTask(row: Record<string, unknown>): Task {
  return {
    task_id: row.task_id as string,
    workspace_id: row.workspace_id as string,
    project_id: row.project_id as string,
    title: row.title as string,
    description: row.description as string | null,
    status: row.status as TaskStatus,
    depends_on: JSON.parse(row.depends_on as string) as string[],
    assigned_to: row.assigned_to as string | null,
    note: row.note as string | null,
    version: row.version as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

export async function listTasks(input: ListTasksInput): Promise<Task[]> {
  const db = getDb()
  let sql = 'SELECT * FROM tasks WHERE workspace_id = ?'
  const params: unknown[] = [input.workspace_id]
  if (input.project_id) { sql += ' AND project_id = ?'; params.push(input.project_id) }
  if (input.status) { sql += ' AND status = ?'; params.push(input.status) }
  sql += ' ORDER BY created_at ASC'
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  return rows.map(rowToTask)
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const db = getDb()
  const task_id = ulid()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO tasks (task_id, workspace_id, project_id, title, description, depends_on, assigned_to, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    task_id,
    input.workspace_id,
    input.project_id,
    input.title,
    input.description ?? null,
    JSON.stringify(input.depends_on ?? []),
    input.assigned_to ?? null,
    now,
    now
  )
  return rowToTask(db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(task_id) as Record<string, unknown>)
}

export async function updateTask(input: UpdateTaskInput): Promise<Task> {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(input.task_id) as Record<string, unknown> | undefined
  if (!existing) throw new FulcrumError(`Task ${input.task_id} not found`, 'not_found')

  if (input.expected_version !== undefined && existing.version !== input.expected_version) {
    throw new FulcrumError(
      `Version conflict: expected ${input.expected_version}, got ${existing.version as number}`,
      'version_conflict'
    )
  }

  const fields: string[] = ['version = version + 1', "updated_at = ?"]
  const values: unknown[] = [new Date().toISOString()]
  if (input.status !== undefined) { fields.push('status = ?'); values.push(input.status) }
  if (input.note !== undefined) { fields.push('note = ?'); values.push(input.note) }
  if (input.assigned_to !== undefined) { fields.push('assigned_to = ?'); values.push(input.assigned_to) }
  if (input.description !== undefined) { fields.push('description = ?'); values.push(input.description) }
  values.push(input.task_id)

  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE task_id = ?`).run(...values)
  return rowToTask(db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(input.task_id) as Record<string, unknown>)
}
