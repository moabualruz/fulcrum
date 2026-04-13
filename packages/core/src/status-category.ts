import type { StatusCategory } from './types.js'

const BACKLOG = new Set([
  'queued', 'ready', 'backlog', 'draft', 'never_synced',
])
const ACTIVE = new Set([
  'claimed', 'running', 'starting', 'waiting', 'in_progress',
  'in_review', 'syncing', 'created',
])
const BLOCKED = new Set([
  'blocked', 'waiting_input', 'waiting_dependency', 'conflicted',
])
const DONE = new Set([
  'completed', 'done', 'finished', 'cancelled', 'failed',
  'aborted', 'archived', 'approved', 'merged', 'discarded',
])

export function statusCategory(status: string): StatusCategory {
  if (BACKLOG.has(status)) return 'backlog'
  if (ACTIVE.has(status))  return 'active'
  if (BLOCKED.has(status)) return 'blocked'
  if (DONE.has(status))    return 'done'
  return 'active' // safe default for future statuses
}
