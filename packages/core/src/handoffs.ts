import type { Database } from 'better-sqlite3'
import { getDb } from './db/client.js'
import { newId } from './ids.js'
import { emitEvent } from './events.js'
import { FulcrumError } from './types.js'
import type { HandoffPacket, CreateHandoffInput } from './types.js'

function rowToHandoff(row: Record<string, unknown>): HandoffPacket {
  return {
    handoff_id: row.handoff_id as string,
    workspace_id: row.workspace_id as string,
    project_id: (row.project_id as string | null) ?? undefined,
    task_id: (row.task_id as string | null) ?? undefined,
    issue_id: (row.issue_id as string | null) ?? undefined,
    from_agent_id: (row.from_agent_id as string | null) ?? undefined,
    to_agent_id: (row.to_agent_id as string | null) ?? undefined,
    goal: row.goal as string,
    task_type: (row.task_type as string) || '',
    priority: (row.priority as HandoffPacket['priority']) || 'normal',
    scope: (row.scope as HandoffPacket['scope']) || 'task',
    inputs: (() => {
      try { return JSON.parse(row.inputs as string) as Record<string, unknown> } catch { return {} }
    })(),
    constraints: (() => {
      try {
        const val = row.constraints as string | null
        if (!val) return undefined
        const parsed = JSON.parse(val) as unknown
        return Array.isArray(parsed) && parsed.length > 0 ? (parsed as string[]) : undefined
      } catch { return undefined }
    })(),
    done_criteria: (row.done_criteria as string | null) ?? undefined,
    artifact_contract_id: (row.artifact_contract_id as string | null) ?? undefined,
    handoff_mode: (row.handoff_mode as string) || 'brief',
    status: (row.status as HandoffPacket['status']) || 'pending',
    claimed_at: (row.claimed_at as string | null) ?? undefined,
    created_at: row.created_at as string,
  }
}

export function createHandoff(db: Database, input: CreateHandoffInput): HandoffPacket {
  const handoff_id = newId('handoff')
  const now = new Date().toISOString()
  const priority = input.priority ?? 'normal'
  const scope = input.scope ?? 'task'
  const inputs = JSON.stringify(input.inputs ?? {})
  const constraints = input.constraints && input.constraints.length > 0
    ? JSON.stringify(input.constraints)
    : null
  const handoff_mode = input.handoff_mode ?? 'brief'

  db.prepare(`
    INSERT INTO handoffs (
      handoff_id, workspace_id, project_id, from_agent_id, to_agent_id,
      task_id, issue_id, goal, task_type, priority, scope,
      inputs, constraints, done_criteria, artifact_contract_id,
      handoff_mode, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    handoff_id,
    input.workspace_id,
    input.project_id ?? null,
    input.from_agent_id ?? null,
    input.to_agent_id ?? null,
    input.task_id ?? null,
    input.issue_id ?? null,
    input.goal,
    input.task_type,
    priority,
    scope,
    inputs,
    constraints,
    input.done_criteria ?? null,
    input.artifact_contract_id ?? null,
    handoff_mode,
    now,
  )

  emitEvent({
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    evt_type: 'handoff_created',
    object_type: 'handoff',
    object_id: handoff_id,
    actor_type: 'agent',
    actor_id: input.from_agent_id ?? 'system',
    payload: { goal: input.goal, task_type: input.task_type, handoff_mode },
  })

  return getHandoff(db, handoff_id, input.workspace_id)!
}

export function getHandoff(db: Database, handoff_id: string, workspace_id: string): HandoffPacket | null {
  const row = db.prepare(
    'SELECT * FROM handoffs WHERE handoff_id = ? AND workspace_id = ?'
  ).get(handoff_id, workspace_id) as Record<string, unknown> | undefined
  if (!row) return null
  return rowToHandoff(row)
}

export function listHandoffs(
  db: Database,
  input: { workspace_id: string; to_agent_id?: string; status?: HandoffPacket['status']; limit?: number }
): HandoffPacket[] {
  const conditions: string[] = ['workspace_id = ?']
  const params: unknown[] = [input.workspace_id]

  if (input.to_agent_id !== undefined) {
    conditions.push('to_agent_id = ?')
    params.push(input.to_agent_id)
  }
  if (input.status !== undefined) {
    conditions.push('status = ?')
    params.push(input.status)
  }

  const limit = input.limit ?? 100
  const sql = `SELECT * FROM handoffs WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ?`
  params.push(limit)

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  return rows.map(rowToHandoff)
}

export function claimHandoff(
  db: Database,
  input: { handoff_id: string; workspace_id: string; agent_id: string }
): HandoffPacket {
  const existing = getHandoff(db, input.handoff_id, input.workspace_id)
  if (!existing) {
    throw new FulcrumError(`Handoff ${input.handoff_id} not found`, 'not_found')
  }
  if (existing.status !== 'pending') {
    throw new FulcrumError(
      `Handoff ${input.handoff_id} cannot be claimed — current status: ${existing.status}`,
      'not_found'
    )
  }

  const now = new Date().toISOString()
  db.prepare(`
    UPDATE handoffs
    SET status = 'claimed', claimed_at = ?, to_agent_id = ?
    WHERE handoff_id = ? AND workspace_id = ?
  `).run(now, input.agent_id, input.handoff_id, input.workspace_id)

  emitEvent({
    workspace_id: input.workspace_id,
    evt_type: 'handoff_consumed',
    object_type: 'handoff',
    object_id: input.handoff_id,
    actor_type: 'agent',
    actor_id: input.agent_id,
    payload: { handoff_id: input.handoff_id },
  })

  return getHandoff(db, input.handoff_id, input.workspace_id)!
}

export function completeHandoff(
  db: Database,
  input: { handoff_id: string; workspace_id: string }
): HandoffPacket {
  const existing = getHandoff(db, input.handoff_id, input.workspace_id)
  if (!existing) {
    throw new FulcrumError(`Handoff ${input.handoff_id} not found`, 'not_found')
  }

  db.prepare(`
    UPDATE handoffs
    SET status = 'completed'
    WHERE handoff_id = ? AND workspace_id = ?
  `).run(input.handoff_id, input.workspace_id)

  return getHandoff(db, input.handoff_id, input.workspace_id)!
}

// Re-export a version that uses the global DB singleton (compatible with runs.ts pattern)
export function createHandoffGlobal(input: CreateHandoffInput): HandoffPacket {
  return createHandoff(getDb(), input)
}
