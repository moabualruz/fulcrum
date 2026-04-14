import type Database from 'better-sqlite3'
import { ulid } from 'ulid'
import { createHash } from 'crypto'
import { statusCategory } from './status-category.js'

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

export function applyCoSResponse(
  db: Database.Database,
  workspace_id: string,
  response: CoSResponse,
  project_id?: string
): { tasks_updated: number; memories_written: number } {
  const now = new Date().toISOString()
  let tasks_updated = 0
  let memories_written = 0

  // Resolve project_id for memory writes: use provided or fall back to first project in workspace
  let resolvedProjectId = project_id
  if (!resolvedProjectId && Array.isArray(response.memory_writes) && response.memory_writes.length > 0) {
    const proj = db.prepare('SELECT project_id FROM projects WHERE workspace_id = ? LIMIT 1')
      .get(workspace_id) as { project_id: string } | undefined
    resolvedProjectId = proj?.project_id
  }

  // Apply task updates
  if (Array.isArray(response.task_updates)) {
    for (const update of response.task_updates) {
      if (!update.task_id) continue

      const fields: string[] = ['updated_at = ?', 'version = version + 1']
      const values: unknown[] = [now]

      if (update.status !== undefined) {
        fields.push('status = ?')
        values.push(update.status)
        // Also update status_category based on status
        fields.push('status_category = ?')
        values.push(statusCategory(update.status))
      }
      if (update.title !== undefined) {
        fields.push('title = ?')
        values.push(update.title)
      }
      if (update.description !== undefined) {
        fields.push('description = ?')
        values.push(update.description)
      }

      values.push(update.task_id, workspace_id)
      const result = db.prepare(
        `UPDATE tasks SET ${fields.join(', ')} WHERE task_id = ? AND workspace_id = ?`
      ).run(...values)

      tasks_updated += result.changes
    }
  }

  // Apply memory writes
  if (Array.isArray(response.memory_writes) && resolvedProjectId) {
    for (const mw of response.memory_writes) {
      if (!mw.content || !mw.content.trim()) continue

      const memory_id = 'mem_' + ulid()
      const kind = mw.kind ?? 'fact'
      const scope = mw.scope ?? 'project'
      const content = mw.content
      const title = content.slice(0, 80)
      const summary = title
      const canonical_text = content
      const content_hash = createHash('sha256').update(content).digest('hex')

      db.prepare(`
        INSERT INTO memories
          (memory_id, workspace_id, project_id, scope, kind, title, summary,
           content, canonical_text, tags, entities, confidence, embedding,
           task_id, issue_id, artifact_id, provenance_refs,
           content_hash, created_at, updated_at, last_accessed_at, access_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, 0)
      `).run(
        memory_id,
        workspace_id,
        resolvedProjectId,
        scope,
        kind,
        title,
        summary,
        content,
        canonical_text,
        JSON.stringify([]),
        JSON.stringify([]),
        1.0,
        JSON.stringify([]),
        content_hash,
        now,
        now,
        now
      )

      memories_written += 1
    }
  }

  return { tasks_updated, memories_written }
}

