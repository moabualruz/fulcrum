// packages/planning/src/epics.ts
import { getDb, FulcrumError, emitEvent, nextDisplayId, statusCategory, newId } from '@fulcrum/core'
import type { Epic, CreateEpicInput, UpdateEpicInput, ListEpicsInput, EpicStatus, StatusCategory } from './types.js'

function rowToEpic(row: Record<string, unknown>): Epic {
  return {
    epic_id: row.epic_id as string,
    workspace_id: row.workspace_id as string,
    project_id: row.project_id as string,
    display_id: row.display_id as string,
    title: row.title as string,
    description: row.description as string | null,
    status: row.status as EpicStatus,
    status_category: row.status_category as StatusCategory,
    priority: row.priority as Epic['priority'],
    milestone_id: row.milestone_id as string | null,
    version: row.version as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

export async function createEpic(input: CreateEpicInput, db = getDb()): Promise<Epic> {
  if (!input.title.trim()) throw new FulcrumError('title must not be empty', 'invalid_input')
  const epic_id = newId('epic')
  const now = new Date().toISOString()
  const priority = input.priority ?? 'medium'
  const status: EpicStatus = 'backlog'
  const status_cat = statusCategory(status)
  const display_id = nextDisplayId('epic', input.project_id, db)

  db.prepare(`
    INSERT INTO epics
      (epic_id, workspace_id, project_id, display_id, title, description, status, status_category, priority, milestone_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    epic_id, input.workspace_id, input.project_id, display_id,
    input.title, input.description ?? null, status, status_cat, priority,
    input.milestone_id ?? null, now, now
  )

  emitEvent({
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    evt_type: 'epic_created',
    object_type: 'epic',
    object_id: epic_id,
    actor_type: 'system',
    actor_id: 'system',
    payload: { title: input.title },
  })

  const row = db.prepare('SELECT * FROM epics WHERE epic_id = ?').get(epic_id) as Record<string, unknown>
  return rowToEpic(row)
}

export async function updateEpic(input: UpdateEpicInput, db = getDb()): Promise<Epic> {
  const existing = db.prepare('SELECT * FROM epics WHERE epic_id = ? AND workspace_id = ?')
    .get(input.epic_id, input.workspace_id) as Record<string, unknown> | undefined
  if (!existing) throw new FulcrumError(`Epic ${input.epic_id} not found`, 'not_found')

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

  const statusChanging = input.status !== undefined && input.status !== (existing.status as string)

  if (input.status !== undefined) {
    fields.push('status = ?'); values.push(input.status)
    fields.push('status_category = ?'); values.push(statusCategory(input.status))
  }
  values.push(input.epic_id)

  db.prepare(`UPDATE epics SET ${fields.join(', ')} WHERE epic_id = ?`).run(...values)

  if (statusChanging) {
    emitEvent({
      workspace_id: existing.workspace_id as string,
      project_id: existing.project_id as string,
      evt_type: 'task_status_changed',
      object_type: 'epic',
      object_id: input.epic_id,
      actor_type: 'system',
      actor_id: 'planning',
      payload: { from_status: existing.status as string, to_status: input.status as string },
    })
  }

  const updated = db.prepare('SELECT * FROM epics WHERE epic_id = ?').get(input.epic_id) as Record<string, unknown>
  return rowToEpic(updated)
}

export async function listEpics(input: ListEpicsInput, db = getDb()): Promise<Epic[]> {
  let sql = 'SELECT * FROM epics WHERE workspace_id = ?'
  const params: unknown[] = [input.workspace_id]
  if (input.project_id) { sql += ' AND project_id = ?'; params.push(input.project_id) }
  if (input.status) { sql += ' AND status = ?'; params.push(input.status) }
  if (input.status_category) { sql += ' AND status_category = ?'; params.push(input.status_category) }
  sql += ' ORDER BY created_at ASC'
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  return rows.map(rowToEpic)
}
