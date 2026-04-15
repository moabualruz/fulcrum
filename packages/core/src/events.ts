import { getDb , Db} from './db/client.js'
import { newId } from './ids.js'
import { getEventBus } from './event-bus.js'
export type { EmitEventInput } from './types.js'
import type { EmitEventInput } from './types.js'

export function emitEvent(input: EmitEventInput, db: Db = getDb()): void {
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

  // Fire in-process event bus after successful DB write (GAP-ARCH-8).
  // Non-blocking: subscriber errors are swallowed inside fire().
  getEventBus().fire(input)
}
