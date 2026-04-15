// packages/planning/src/plans.ts
import { getDb, FulcrumError, emitEvent, nextDisplayId, newId, Db} from '@fulcrum/core'
import type { Plan, CreatePlanInput, UpdatePlanInput, ListPlansInput, LinkIssueToPlanInput, PlanStatus, StatusCategory } from './types.js'

function planStatusCategory(status: PlanStatus): StatusCategory {
  if (status === 'completed' || status === 'archived') return 'done'
  return 'active' // draft, active
}

function rowToPlan(row: Record<string, unknown>): Plan {
  return {
    plan_id: row.plan_id as string,
    workspace_id: row.workspace_id as string,
    project_id: row.project_id as string,
    display_id: row.display_id as string,
    title: row.title as string,
    description: row.description as string | null,
    status: row.status as PlanStatus,
    status_category: row.status_category as StatusCategory,
    prd_id: row.prd_id as string | null,
    file_path: row.file_path as string | null,
    version: row.version as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

export async function createPlan(input: CreatePlanInput, db: Db = getDb()): Promise<Plan> {
  if (!input.title.trim()) throw new FulcrumError('title must not be empty', 'invalid_input')
  const plan_id = newId('plan')
  const now = new Date().toISOString()
  const status: PlanStatus = 'draft'
  const status_cat = planStatusCategory(status)
  const display_id = nextDisplayId('plan', input.project_id, db)

  db.prepare(`
    INSERT INTO plans
      (plan_id, workspace_id, project_id, display_id, title, description, status, status_category, prd_id, file_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    plan_id, input.workspace_id, input.project_id, display_id,
    input.title, input.description ?? null, status, status_cat,
    input.prd_id ?? null, input.file_path ?? null, now, now
  )

  emitEvent({
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    evt_type: 'artifact_written',
    object_type: 'plan',
    object_id: plan_id,
    actor_type: 'system',
    actor_id: 'system',
    payload: { title: input.title },
  })

  const row = db.prepare('SELECT * FROM plans WHERE plan_id = ?').get(plan_id) as Record<string, unknown>
  return rowToPlan(row)
}

export async function updatePlan(input: UpdatePlanInput, db: Db = getDb()): Promise<Plan> {
  const existing = db.prepare('SELECT * FROM plans WHERE plan_id = ? AND workspace_id = ?')
    .get(input.plan_id, input.workspace_id) as Record<string, unknown> | undefined
  if (!existing) throw new FulcrumError(`Plan ${input.plan_id} not found`, 'not_found')

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
  if (input.prd_id !== undefined) { fields.push('prd_id = ?'); values.push(input.prd_id) }

  const statusChanging = input.status !== undefined && input.status !== (existing.status as string)

  if (input.status !== undefined) {
    fields.push('status = ?'); values.push(input.status)
    fields.push('status_category = ?'); values.push(planStatusCategory(input.status))
  }
  values.push(input.plan_id)

  db.prepare(`UPDATE plans SET ${fields.join(', ')} WHERE plan_id = ?`).run(...values)

  if (statusChanging) {
    emitEvent({
      workspace_id: existing.workspace_id as string,
      project_id: existing.project_id as string,
      evt_type: 'plan_status_changed',
      object_type: 'plan',
      object_id: input.plan_id,
      actor_type: 'system',
      actor_id: 'planning',
      payload: { from_status: existing.status as string, to_status: input.status as string },
    })
  }

  const updated = db.prepare('SELECT * FROM plans WHERE plan_id = ?').get(input.plan_id) as Record<string, unknown>
  return rowToPlan(updated)
}

export async function listPlans(input: ListPlansInput, db: Db = getDb()): Promise<Plan[]> {
  let sql = 'SELECT * FROM plans WHERE workspace_id = ?'
  const params: unknown[] = [input.workspace_id]
  if (input.project_id) { sql += ' AND project_id = ?'; params.push(input.project_id) }
  if (input.status) { sql += ' AND status = ?'; params.push(input.status) }
  if (input.status_category) { sql += ' AND status_category = ?'; params.push(input.status_category) }
  sql += ' ORDER BY created_at ASC'
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  return rows.map(rowToPlan)
}

export async function linkIssueToPlan(input: LinkIssueToPlanInput, db: Db = getDb()): Promise<void> {
  const plan = db.prepare('SELECT plan_id FROM plans WHERE plan_id = ? AND workspace_id = ?')
    .get(input.plan_id, input.workspace_id) as Record<string, unknown> | undefined
  if (!plan) throw new FulcrumError(`Plan ${input.plan_id} not found`, 'not_found')

  const issue = db.prepare('SELECT issue_id FROM issues WHERE issue_id = ? AND workspace_id = ?')
    .get(input.issue_id, input.workspace_id) as Record<string, unknown> | undefined
  if (!issue) throw new FulcrumError(`Issue ${input.issue_id} not found`, 'not_found')

  db.prepare(`
    INSERT OR IGNORE INTO plan_issues (plan_id, issue_id) VALUES (?, ?)
  `).run(input.plan_id, input.issue_id)
}
