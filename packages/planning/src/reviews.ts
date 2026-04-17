// packages/planning/src/reviews.ts
import { getDb, FulcrumError, emitEvent, nextDisplayId, newId, Db} from 'fulcrum-agent-core'
import type { Review, CreateReviewInput, UpdateReviewInput, ReviewStatus } from './types.js'

function rowToReview(row: Record<string, unknown>): Review {
  return {
    review_id: row.review_id as string,
    workspace_id: row.workspace_id as string,
    project_id: (row.project_id ?? undefined) as string | undefined,
    display_id: row.display_id as string,
    status: row.status as ReviewStatus,
    target_type: row.target_type as Review['target_type'],
    target_id: row.target_id as string,
    reviewer_agent_id: (row.reviewer_agent_id ?? undefined) as string | undefined,
    summary: (row.summary ?? undefined) as string | undefined,
    file_path: (row.file_path ?? undefined) as string | undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

export async function createReview(input: CreateReviewInput, db: Db = getDb()): Promise<Review> {
  if (!input.project_id) throw new FulcrumError('project_id is required', 'invalid_input')
  const review_id = newId('review')
  const now = new Date().toISOString()
  const display_id = nextDisplayId('review', input.project_id, db)

  db.prepare(`
    INSERT INTO reviews
      (review_id, workspace_id, project_id, display_id, status,
       target_type, target_id, reviewer_agent_id, summary, file_path,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    review_id, input.workspace_id, input.project_id, display_id,
    input.target_type, input.target_id,
    input.reviewer_agent_id ?? null,
    input.summary ?? null,
    input.file_path ?? null,
    now, now
  )

  emitEvent({
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    evt_type: 'review_created',
    object_type: 'review',
    object_id: review_id,
    actor_type: 'system',
    actor_id: 'system',
    payload: { target_type: input.target_type, target_id: input.target_id },
  })

  const row = db.prepare('SELECT * FROM reviews WHERE review_id = ?').get(review_id) as Record<string, unknown>
  return rowToReview(row)
}

export async function updateReview(input: UpdateReviewInput, db: Db = getDb()): Promise<Review> {
  const existing = db.prepare('SELECT * FROM reviews WHERE review_id = ? AND workspace_id = ?')
    .get(input.review_id, input.workspace_id) as Record<string, unknown> | undefined
  if (!existing) throw new FulcrumError(`Review ${input.review_id} not found`, 'not_found')

  const now = new Date().toISOString()
  const fields: string[] = ['status = ?', 'updated_at = ?']
  const values: unknown[] = [input.status, now]
  if (input.summary !== undefined) { fields.push('summary = ?'); values.push(input.summary) }
  values.push(input.review_id)

  db.prepare(`UPDATE reviews SET ${fields.join(', ')} WHERE review_id = ?`).run(...values)

  emitEvent({
    workspace_id: existing.workspace_id as string,
    project_id: existing.project_id as string,
    evt_type: 'review_updated',
    object_type: 'review',
    object_id: input.review_id,
    actor_type: 'system',
    actor_id: 'system',
    payload: { old_status: existing.status as string, new_status: input.status },
  })

  const updated = db.prepare('SELECT * FROM reviews WHERE review_id = ?').get(input.review_id) as Record<string, unknown>
  return rowToReview(updated)
}

export async function getReview(review_id: string, workspace_id: string, db: Db = getDb()): Promise<Review | null> {
  const row = db.prepare('SELECT * FROM reviews WHERE review_id = ? AND workspace_id = ?')
    .get(review_id, workspace_id) as Record<string, unknown> | undefined
  return row ? rowToReview(row) : null
}

export async function listReviews(input: {
  workspace_id: string
  target_id?: string
  status?: ReviewStatus
  reviewer_agent_id?: string
  limit?: number
}, db: Db = getDb()): Promise<Review[]> {
  let sql = 'SELECT * FROM reviews WHERE workspace_id = ?'
  const params: unknown[] = [input.workspace_id]
  if (input.target_id) { sql += ' AND target_id = ?'; params.push(input.target_id) }
  if (input.status) { sql += ' AND status = ?'; params.push(input.status) }
  if (input.reviewer_agent_id) { sql += ' AND reviewer_agent_id = ?'; params.push(input.reviewer_agent_id) }
  sql += ' ORDER BY created_at ASC'
  if (input.limit !== undefined) { sql += ' LIMIT ?'; params.push(input.limit) }
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  return rows.map(rowToReview)
}
