import { writeLifecycleMemory } from './memory-insert.js'
import type { Db } from './db/client.js'
import { updateTask } from './tasks.js'
import type { MemoryKind, MemoryScope, TaskStatus } from './types.js'

export interface CoSResponse {
  task_updates?: Array<{
    task_id: string
    status?: string
    title?: string
    description?: string
  }>
  memory_writes?: Array<{
    content: string
    kind?: string
    scope?: string
  }>
  next_action?: string
  reasoning?: string
}

function isValidShape(obj: unknown): obj is CoSResponse {
  if (typeof obj !== 'object' || obj === null) return false
  const o = obj as Record<string, unknown>
  if ('task_updates' in o && !Array.isArray(o.task_updates)) return false
  if ('memory_writes' in o && !Array.isArray(o.memory_writes)) return false
  return true
}

export function parseCoSResponse(raw: string): CoSResponse {
  // Attempt 1: direct JSON parse
  try {
    const parsed = JSON.parse(raw) as unknown
    if (isValidShape(parsed)) return parsed as CoSResponse
  } catch {
    // fall through
  }

  // Attempt 2: extract JSON from markdown code block
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) {
    try {
      const parsed = JSON.parse(match[1].trim()) as unknown
      if (isValidShape(parsed)) return parsed as CoSResponse
    } catch {
      // fall through
    }
  }

  // Graceful degradation: return reasoning with raw string
  return { reasoning: raw }
}

export async function applyCoSResponse(
  db: Db,
  workspace_id: string,
  response: CoSResponse,
  project_id?: string
): Promise<{ tasks_updated: number; memories_written: number }> {
  let tasks_updated = 0
  let memories_written = 0

  // Resolve project_id for memory writes: use provided or fall back to first project in workspace
  let resolvedProjectId = project_id
  if (!resolvedProjectId && Array.isArray(response.memory_writes) && response.memory_writes.length > 0) {
    const proj = db.prepare('SELECT project_id FROM projects WHERE workspace_id = ? LIMIT 1')
      .get(workspace_id) as { project_id: string } | undefined
    resolvedProjectId = proj?.project_id
  }

  // Apply task updates — route through updateTask() so VALID_TRANSITIONS is
  // enforced and task_status_changed events are emitted (CORE-002 fix).
  // Verify workspace ownership before update to prevent cross-workspace writes.
  if (Array.isArray(response.task_updates)) {
    for (const update of response.task_updates) {
      if (!update.task_id) continue
      // Workspace ownership check — only update tasks belonging to this workspace
      const owner = db.prepare('SELECT workspace_id FROM tasks WHERE task_id = ? AND workspace_id = ?')
        .get(update.task_id, workspace_id) as { workspace_id: string } | undefined
      if (!owner) continue
      try {
        await updateTask(
          {
            task_id: update.task_id,
            workspace_id,
            ...(update.status !== undefined ? { status: update.status as TaskStatus } : {}),
            ...(update.title !== undefined ? { title: update.title } : {}),
            ...(update.description !== undefined ? { description: update.description } : {}),
          },
          db,
        )
        tasks_updated += 1
      } catch {
        // Invalid transition or task not found — skip this directive, do not abort the batch
      }
    }
  }

  // Apply memory writes — delegate to writeMemory so we always match the
  // canonical schema (freshness, importance, embedding, content_hash, etc.)
  // and the canonical id scheme (newId('memory')).
  if (Array.isArray(response.memory_writes) && resolvedProjectId) {
    for (const mw of response.memory_writes) {
      if (!mw.content || !mw.content.trim()) continue
      await writeLifecycleMemory({
        workspace_id,
        project_id: resolvedProjectId,
        content: mw.content,
        kind: (mw.kind ?? 'fact') as MemoryKind,
        scope: (mw.scope ?? 'project') as MemoryScope,
      })
      memories_written += 1
    }
  }

  return { tasks_updated, memories_written }
}
