import type Database from 'better-sqlite3'

export interface CoSWorldState {
  goal: string
  tasks: {
    backlog: Array<{ task_id: string; display_id: string; title: string; status: string }>
    active: Array<{ task_id: string; display_id: string; title: string; status: string }>
    blocked: Array<{ task_id: string; display_id: string; title: string; status: string }>
    done: Array<{ task_id: string; display_id: string; title: string; status: string }>
  }
  recent_events: Array<{ evt_type: string; payload: unknown; ts: string }>
  recalled_memories: Array<{ memory_id: string; content: string; kind: string; score?: number }>
}

export interface BuildWorldStateInput {
  workspace_id: string
  goal: string
  limit_tasks?: number
  limit_events?: number
  limit_memories?: number
}

type TaskRow = { task_id: string; display_id: string; title: string; status: string; status_category: string }
type EventRow = { evt_type: string; payload: string; ts: string }
type MemoryRow = { memory_id: string; content: string; kind: string }

export function buildWorldState(db: Database.Database, input: BuildWorldStateInput): CoSWorldState {
  const limitTasks = input.limit_tasks ?? 50
  const limitEvents = input.limit_events ?? 20
  const limitMemories = input.limit_memories ?? 10

  // Query tasks grouped by status_category
  const categories = ['backlog', 'active', 'blocked', 'done'] as const
  const tasksByCategory: CoSWorldState['tasks'] = {
    backlog: [],
    active: [],
    blocked: [],
    done: [],
  }

  for (const cat of categories) {
    const rows = db.prepare(
      `SELECT task_id, display_id, title, status, status_category
       FROM tasks
       WHERE workspace_id = ? AND status_category = ?
       ORDER BY created_at ASC
       LIMIT ?`
    ).all(input.workspace_id, cat, limitTasks) as TaskRow[]

    tasksByCategory[cat] = rows.map(r => ({
      task_id: r.task_id,
      display_id: r.display_id,
      title: r.title,
      status: r.status,
    }))
  }

  // Query recent events
  const eventRows = db.prepare(
    `SELECT evt_type, payload, ts
     FROM events
     WHERE workspace_id = ?
     ORDER BY ts DESC
     LIMIT ?`
  ).all(input.workspace_id, limitEvents) as EventRow[]

  const recentEvents = eventRows.map(r => {
    let payload: unknown = {}
    try { payload = JSON.parse(r.payload) } catch { payload = r.payload }
    return { evt_type: r.evt_type, payload, ts: r.ts }
  })

  // Simple LIKE-based memory recall using goal's first 50 chars
  const goalSnippet = input.goal.slice(0, 50)
  const escaped = goalSnippet.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
  const memoryRows = db.prepare(
    `SELECT memory_id, content, kind
     FROM memories
     WHERE workspace_id = ? AND content LIKE ? ESCAPE '\\'
     LIMIT ?`
  ).all(input.workspace_id, `%${escaped}%`, limitMemories) as MemoryRow[]

  const recalledMemories = memoryRows.map(r => ({
    memory_id: r.memory_id,
    content: r.content,
    kind: r.kind,
  }))

  return {
    goal: input.goal,
    tasks: tasksByCategory,
    recent_events: recentEvents,
    recalled_memories: recalledMemories,
  }
}
