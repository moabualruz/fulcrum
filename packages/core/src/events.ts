import { getDb } from './db/client.js'
import { newId } from './ids.js'
import type { EventType } from './types.js'

export interface EmitEventInput {
  workspace_id: string
  project_id?: string
  evt_type: EventType
  object_type?: string
  object_id?: string
  actor_type: string
  actor_id: string
  payload?: Record<string, unknown>
  severity?: 'debug' | 'info' | 'warn' | 'error'
  trace_id?: string
  span_id?: string
  correlation_id?: string
}

export function emitEvent(input: EmitEventInput, db = getDb()): void {
  db.prepare(`
    INSERT INTO events
      (evt_id, workspace_id, project_id, evt_type, ts,
       object_type, object_id, actor_type, actor_id, payload, severity,
       trace_id, span_id, correlation_id)
    VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    newId('event'),
    input.workspace_id,
    input.project_id ?? null,
    input.evt_type,
    input.object_type ?? null,
    input.object_id ?? null,
    input.actor_type,
    input.actor_id,
    JSON.stringify(input.payload ?? {}),
    input.severity ?? 'info',
    input.trace_id ?? null,
    input.span_id ?? null,
    input.correlation_id ?? null
  )
}
