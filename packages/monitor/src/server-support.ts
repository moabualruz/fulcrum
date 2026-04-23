import { getDb, type EmitEventInput } from 'fulcrum-agent-core'
import { redactRoadmapArtifact } from 'fulcrum-memory'

export const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0:0:0:0:0:0:0:1'])
const DEFAULT_PAGE_LIMIT = 50
const MAX_PAGE_LIMIT = 200

export function readPagination(query: (name: string) => string | undefined): { limit: number; offset: number } {
  const rawLimit = Number.parseInt(query('limit') ?? String(DEFAULT_PAGE_LIMIT), 10)
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT)

  const rawOffset = Number.parseInt(query('cursor') ?? query('offset') ?? '0', 10)
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0)
  return { limit, offset }
}

export function paginated<T>(data: T[], total: number, limit: number, offset: number): {
  data: T[]
  pagination: { total: number; limit: number; offset: number; next_cursor: string | null }
} {
  const nextOffset = offset + data.length
  return {
    data,
    pagination: {
      total,
      limit,
      offset,
      next_cursor: nextOffset < total ? String(nextOffset) : null,
    },
  }
}

export function statusForError(err: unknown): 400 | 403 | 404 | 409 | 500 {
  const code = (err as { code?: string }).code
  if (code === 'invalid_input') return 400
  if (code === 'policy_blocked' || code === 'policy_denied') return 403
  if (code === 'not_found') return 404
  if (code === 'conflict' || code === 'invalid_state' || code === 'version_conflict') return 409
  return 500
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'internal_error'
}

export function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map(v => v.trim()).filter(Boolean)
  return []
}

export function redactRagReadout<T>(value: T): T {
  return redactRoadmapArtifact(value)
}

export function formatSseEvent(event: {
  evt_type: string
  payload?: unknown
  workspace_id?: string
  project_id?: string
  agent_id?: string
  run_id?: string
  task_id?: string
  event_id?: string
  evt_id?: string
  created_at?: string
  ts?: string
}): Uint8Array {
  const eventId = event.event_id ?? event.evt_id ?? Date.now().toString()
  const ts = event.created_at ?? event.ts ?? new Date().toISOString()
  const data = JSON.stringify({
    ...event,
    evt_id: eventId,
    event_id: eventId,
    event_type: event.evt_type,
    ts,
    created_at: ts,
  })
  return new TextEncoder().encode(`id: ${eventId}\ndata: ${data}\n\n`)
}

export function createSseBusHandler(
  sseControllers: Set<ReadableStreamDefaultController>,
): (event: EmitEventInput) => void {
  return (event: EmitEventInput) => {
    if (sseControllers.size === 0) return
    const chunk = formatSseEvent(event)

    for (const controller of [...sseControllers]) {
      try {
        controller.enqueue(chunk)
      } catch {
        sseControllers.delete(controller)
      }
    }
  }
}

export async function readPciStatus(): Promise<{
  files_indexed: number
  chunks_indexed: number
  vecs_in_index: number
  last_change_at: string | null
  watcher_refcount: number
  active_watchers: number
}> {
  let watcher_refcount = 0
  let active_watchers = 0
  try {
    const moduleName = 'fulcrum-memory'
    const mem = (await import(/* @vite-ignore */ moduleName)) as any
    const pciMod = mem?.pciStatus ? mem : (await import(/* @vite-ignore */ `${moduleName}/dist/index.js`).catch(() => null) as any)
    const status = typeof pciMod?.pciStatus === 'function' ? pciMod.pciStatus() : null
    if (status) {
      active_watchers = Number(status.activeWatchers ?? 0)
      const refcounts = status.refcounts ?? {}
      for (const value of Object.values(refcounts)) watcher_refcount += Number(value)
    }
  } catch {
    // Fall through to DB-only fallback.
  }

  const db = getDb()
  const files = db.prepare('SELECT COUNT(*) AS n FROM code_files').get() as { n: number } | undefined
  const chunks = db.prepare('SELECT COUNT(*) AS n FROM code_chunks').get() as { n: number } | undefined
  const latest = db.prepare('SELECT MAX(indexed_at) AS ts FROM code_chunks').get() as { ts: string | null } | undefined
  return {
    files_indexed: Number(files?.n ?? 0),
    chunks_indexed: Number(chunks?.n ?? 0),
    vecs_in_index: Number(chunks?.n ?? 0),
    last_change_at: latest?.ts ?? null,
    watcher_refcount,
    active_watchers,
  }
}
