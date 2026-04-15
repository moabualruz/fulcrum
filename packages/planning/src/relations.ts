// packages/planning/src/relations.ts
import { getDb, FulcrumError, Db} from '@fulcrum/core'
import type { Task } from '@fulcrum/core'
import type { TaskRelation, AddTaskRelationInput, RemoveTaskRelationInput, GetTaskRelationsInput } from './types.js'

function rowToTask(row: Record<string, unknown>): Task {
  return {
    task_id: row.task_id as string,
    workspace_id: row.workspace_id as string,
    project_id: row.project_id as string,
    issue_id: row.issue_id as string | null,
    display_id: row.display_id as string,
    title: row.title as string,
    description: row.description as string | null,
    status: row.status as Task['status'],
    status_category: row.status_category as Task['status_category'],
    priority: row.priority as Task['priority'],
    estimate_type: row.estimate_type as Task['estimate_type'],
    estimate_value: row.estimate_value as number | null,
    assigned_to: row.assigned_to as string | null,
    note: row.note as string | null,
    done_criteria: row.done_criteria as string | null,
    version: row.version as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    claimed_at: row.claimed_at as string | null,
    completed_at: row.completed_at as string | null,
    assigned_run_id: (row.assigned_run_id ?? null) as string | null,
    labels: (() => { try { return JSON.parse(row.labels as string) as string[] } catch { return [] } })(),
    blockers: (() => { try { return JSON.parse(row.blockers as string) as string[] } catch { return [] } })(),
  }
}

// PLAN-004: relation types that form directional dependency chains — checked for cycles
const DIRECTED_RELATION_TYPES: ReadonlySet<string> = new Set([
  'blocks', 'follows', 'must_merge_before',
])

/**
 * Returns true if adding (fromId → toId) for the given relation type would
 * create a cycle. Uses a recursive CTE to walk the existing graph.
 * Only checked for directed dependency relations.
 */
function wouldCreateCycle(db: Db, fromId: string, toId: string, relationType: string): boolean {
  if (!DIRECTED_RELATION_TYPES.has(relationType)) return false
  // A cycle exists if `toId` already transitively reaches `fromId` via the same relation type.
  const row = db.prepare(`
    WITH RECURSIVE reachable(node) AS (
      SELECT target_task_id FROM task_relations
       WHERE task_id = ? AND relation_type = ?
      UNION
      SELECT r.target_task_id FROM task_relations r
      JOIN reachable rc ON r.task_id = rc.node
       WHERE r.relation_type = ?
    )
    SELECT 1 FROM reachable WHERE node = ? LIMIT 1
  `).get(toId, relationType, relationType, fromId)
  return row !== undefined
}

export async function addTaskRelation(input: AddTaskRelationInput, db: Db = getDb()): Promise<void> {
  if (input.task_id === input.target_task_id) {
    throw new FulcrumError('task_id and target_task_id must be different', 'invalid_input')
  }
  const task = db.prepare('SELECT task_id FROM tasks WHERE task_id = ?').get(input.task_id)
  if (!task) throw new FulcrumError(`Task ${input.task_id} not found`, 'not_found')
  const target = db.prepare('SELECT task_id FROM tasks WHERE task_id = ?').get(input.target_task_id)
  if (!target) throw new FulcrumError(`Task ${input.target_task_id} not found`, 'not_found')

  // PLAN-004: reject cycles in directed dependency relations
  if (wouldCreateCycle(db, input.task_id, input.target_task_id, input.relation_type)) {
    throw new FulcrumError(
      `Adding relation '${input.relation_type}' from ${input.task_id} to ${input.target_task_id} would create a cycle`,
      'invalid_input'
    )
  }

  db.prepare(`
    INSERT OR IGNORE INTO task_relations (task_id, target_task_id, relation_type)
    VALUES (?, ?, ?)
  `).run(input.task_id, input.target_task_id, input.relation_type)
}

export async function removeTaskRelation(input: RemoveTaskRelationInput, db: Db = getDb()): Promise<void> {
  const result = db.prepare(`
    DELETE FROM task_relations WHERE task_id = ? AND target_task_id = ? AND relation_type = ?
  `).run(input.task_id, input.target_task_id, input.relation_type)
  if (result.changes === 0) {
    throw new FulcrumError(
      `Relation ${input.relation_type} from ${input.task_id} to ${input.target_task_id} not found`,
      'not_found'
    )
  }
}

export async function getBlockers(taskId: string, db: Db = getDb()): Promise<Task[]> {
  // A blocker is any task T where T blocks taskId, i.e. task_relations(T, taskId, 'blocks')
  const rows = db.prepare(`
    SELECT t.* FROM tasks t
    INNER JOIN task_relations r ON r.task_id = t.task_id
    WHERE r.target_task_id = ? AND r.relation_type = 'blocks'
    ORDER BY r.created_at ASC
  `).all(taskId) as Record<string, unknown>[]
  return rows.map(rowToTask)
}

export async function getTaskRelations(input: GetTaskRelationsInput, db: Db = getDb()): Promise<TaskRelation[]> {
  const rows = db.prepare(`
    SELECT * FROM task_relations WHERE task_id = ? ORDER BY created_at ASC
  `).all(input.task_id) as Array<{
    task_id: string
    target_task_id: string
    relation_type: string
    created_at: string
  }>
  return rows.map(r => ({
    task_id: r.task_id,
    target_task_id: r.target_task_id,
    relation_type: r.relation_type as TaskRelation['relation_type'],
    created_at: r.created_at,
  }))
}
