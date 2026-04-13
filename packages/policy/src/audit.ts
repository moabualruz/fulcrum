// packages/policy/src/audit.ts
import { ulid } from 'ulid'
import { getDb } from '@fulcrum/core'
import type { PolicyEvent, LogPolicyEventInput, GetAuditLogInput } from './types.js'

function rowToEvent(row: Record<string, unknown>): PolicyEvent {
  return {
    evt_id: row.evt_id as string,
    rule_id: row.rule_id as string | null,
    workspace_id: row.workspace_id as string,
    action: row.action as string,
    matched: (row.matched as number) === 1,
    actor_id: row.actor_id as string,
    resource_type: row.resource_type as string | null,
    resource_id: row.resource_id as string | null,
    payload: (() => {
      try { return JSON.parse(row.payload as string) as Record<string, unknown> }
      catch { return {} }
    })(),
    ts: row.ts as string,
  }
}

export async function logPolicyEvent(input: LogPolicyEventInput): Promise<void> {
  const db = getDb()
  const evt_id = 'pevt_' + ulid()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO policy_events
      (evt_id, rule_id, workspace_id, action, matched, actor_id, resource_type, resource_id, payload, ts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    evt_id,
    input.rule_id ?? null,
    input.workspace_id,
    input.action,
    input.matched ? 1 : 0,
    input.actor_id,
    input.resource_type ?? null,
    input.resource_id ?? null,
    JSON.stringify(input.payload ?? {}),
    now
  )
}

export async function getAuditLog(input: GetAuditLogInput): Promise<PolicyEvent[]> {
  const db = getDb()
  let sql = 'SELECT * FROM policy_events WHERE workspace_id = ?'
  const params: unknown[] = [input.workspace_id]
  if (input.actor_id) { sql += ' AND actor_id = ?'; params.push(input.actor_id) }
  if (input.action) { sql += ' AND action = ?'; params.push(input.action) }
  sql += ' ORDER BY ts DESC, rowid DESC'
  if (input.limit !== undefined) { sql += ' LIMIT ?'; params.push(input.limit) }
  if (input.offset !== undefined && input.limit !== undefined) {
    sql += ' OFFSET ?'; params.push(input.offset)
  } else if (input.offset !== undefined) {
    sql += ' LIMIT -1 OFFSET ?'; params.push(input.offset)
  }
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  return rows.map(rowToEvent)
}
