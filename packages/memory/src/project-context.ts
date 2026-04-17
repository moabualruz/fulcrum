// v2b PR 13 Task 4.2 — project_context action.
//
// Returns cross-entity bundle per Part 02 §"Control-plane unification" line 64.
// Empty groups are OMITTED (no null fields, no error metadata) per §11.40.

import { getDb, type Db } from 'fulcrum-core'
import { getKuzuClient } from './kuzu/client.js'

export interface ProjectContextInput {
  task_id?: string
  run_id?: string
  file?: string
  symbol?: string
  pr_number?: number
  issue_id?: string
  workspace_id: string
  project_id?: string | null
  limit?: number
}

export type ProjectContextResult = Record<string, unknown[]>

export async function runProjectContext(
  input: ProjectContextInput,
  db: Db = getDb()
): Promise<ProjectContextResult> {
  const limit = input.limit ?? 10
  const ws = input.workspace_id
  const proj = input.project_id ?? null
  const result: ProjectContextResult = {}

  // ── Memories (FTS recall — always available) ─────────────────────────────
  const seedQuery = input.file ?? input.symbol ?? input.task_id ?? input.run_id ?? ''
  if (seedQuery) {
    try {
      const mems = db.prepare(`
        SELECT m.memory_id, m.title, m.summary, m.kind
        FROM memories m
        WHERE m.workspace_id = ?
          ${proj ? 'AND m.project_id = ?' : ''}
        ORDER BY m.created_at DESC LIMIT ?
      `).all(...(proj ? [ws, proj, limit] : [ws, limit]))
      if (mems.length > 0) result['memories'] = mems
    } catch { /* no-op */ }
  }

  // ── Tasks ────────────────────────────────────────────────────────────────
  try {
    const taskQuery = input.task_id
      ? `SELECT task_id, title, status, priority FROM tasks WHERE task_id = ? LIMIT ?`
      : `SELECT task_id, title, status, priority FROM tasks WHERE workspace_id = ?${proj ? ' AND project_id = ?' : ''} LIMIT ?`
    const taskParams = input.task_id
      ? [input.task_id, limit]
      : (proj ? [ws, proj, limit] : [ws, limit])
    const tasks = db.prepare(taskQuery).all(...taskParams)
    if (tasks.length > 0) result['tasks'] = tasks
  } catch { /* no-op */ }

  // ── Agent runs ───────────────────────────────────────────────────────────
  try {
    const runs = db.prepare(`
      SELECT run_id, role, status, status_category
      FROM agent_runs WHERE workspace_id = ? LIMIT ?
    `).all(ws, limit)
    if (runs.length > 0) result['runs'] = runs
  } catch { /* no-op */ }

  // ── Kuzu graph traversal (optional) ──────────────────────────────────────
  const kuzuClient = getKuzuClient()
  if (kuzuClient?.isReady && (input.file || input.symbol)) {
    try {
      const seed = input.file ?? input.symbol!
      const chunks = await kuzuClient.query<Record<string, unknown>>(
        `MATCH (f:File {path: $seed})<-[:ABOUT_FILE]-(c:CodeChunk) RETURN c LIMIT $limit`,
        { seed, limit }
      )
      if (chunks.length > 0) result['code_chunks'] = chunks
    } catch { /* no-op */ }
  }

  return result
}
