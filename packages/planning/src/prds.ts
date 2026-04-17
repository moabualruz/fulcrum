// packages/planning/src/prds.ts
import { getDb, FulcrumError, emitEvent, nextDisplayId, newId, Db} from 'fulcrum-core'
import type { PRD, CreatePRDInput, UpdatePRDInput, ListPRDsInput, PRDStatus, StatusCategory } from './types.js'

function prdStatusCategory(status: PRDStatus): StatusCategory {
  if (status === 'approved' || status === 'archived') return 'done'
  return 'active' // draft, review
}

function rowToPRD(row: Record<string, unknown>): PRD {
  return {
    prd_id: row.prd_id as string,
    workspace_id: row.workspace_id as string,
    project_id: row.project_id as string,
    display_id: row.display_id as string,
    title: row.title as string,
    description: row.description as string | null,
    status: row.status as PRDStatus,
    status_category: row.status_category as StatusCategory,
    file_path: row.file_path as string | null,
    linked_epic_id: row.linked_epic_id as string | null,
    version: row.version as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

export async function createPRD(input: CreatePRDInput, db: Db = getDb()): Promise<PRD> {
  if (!input.title.trim()) throw new FulcrumError('title must not be empty', 'invalid_input')
  const prd_id = newId('prd')
  const now = new Date().toISOString()
  const status: PRDStatus = 'draft'
  const status_cat = prdStatusCategory(status)
  const display_id = nextDisplayId('prd', input.project_id, db)

  db.prepare(`
    INSERT INTO prds
      (prd_id, workspace_id, project_id, display_id, title, description, status, status_category, file_path, linked_epic_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    prd_id, input.workspace_id, input.project_id, display_id,
    input.title, input.description ?? null, status, status_cat,
    input.file_path ?? null, input.linked_epic_id ?? null, now, now
  )

  emitEvent({
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    evt_type: 'artifact_written',
    object_type: 'prd',
    object_id: prd_id,
    actor_type: 'system',
    actor_id: 'system',
    payload: { title: input.title },
  })

  const row = db.prepare('SELECT * FROM prds WHERE prd_id = ?').get(prd_id) as Record<string, unknown>
  return rowToPRD(row)
}

export async function updatePRD(input: UpdatePRDInput, db: Db = getDb()): Promise<PRD> {
  const existing = db.prepare('SELECT * FROM prds WHERE prd_id = ? AND workspace_id = ?')
    .get(input.prd_id, input.workspace_id) as Record<string, unknown> | undefined
  if (!existing) throw new FulcrumError(`PRD ${input.prd_id} not found`, 'not_found')

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
  if (input.file_path !== undefined) { fields.push('file_path = ?'); values.push(input.file_path) }
  if (input.linked_epic_id !== undefined) { fields.push('linked_epic_id = ?'); values.push(input.linked_epic_id) }

  const statusChanging = input.status !== undefined && input.status !== (existing.status as string)

  if (input.status !== undefined) {
    fields.push('status = ?'); values.push(input.status)
    fields.push('status_category = ?'); values.push(prdStatusCategory(input.status))
  }
  values.push(input.prd_id)

  db.prepare(`UPDATE prds SET ${fields.join(', ')} WHERE prd_id = ?`).run(...values)

  if (statusChanging) {
    emitEvent({
      workspace_id: existing.workspace_id as string,
      project_id: existing.project_id as string,
      evt_type: 'prd_status_changed',
      object_type: 'prd',
      object_id: input.prd_id,
      actor_type: 'system',
      actor_id: 'planning',
      payload: { from_status: existing.status as string, to_status: input.status as string },
    })
  }

  const updated = db.prepare('SELECT * FROM prds WHERE prd_id = ?').get(input.prd_id) as Record<string, unknown>
  return rowToPRD(updated)
}

export async function listPRDs(input: ListPRDsInput, db: Db = getDb()): Promise<PRD[]> {
  let sql = 'SELECT * FROM prds WHERE workspace_id = ?'
  const params: unknown[] = [input.workspace_id]
  if (input.project_id) { sql += ' AND project_id = ?'; params.push(input.project_id) }
  if (input.status) { sql += ' AND status = ?'; params.push(input.status) }
  if (input.status_category) { sql += ' AND status_category = ?'; params.push(input.status_category) }
  sql += ' ORDER BY created_at ASC'
  // PLAN-007: pagination
  sql += ' LIMIT ? OFFSET ?'
  params.push(input.limit ?? 100)
  params.push(input.offset ?? 0)
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  return rows.map(rowToPRD)
}
