import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { createTask } from '../tasks.js'
import { parseCoSResponse, applyCoSResponse } from '../cos-parser.js'
import { recallMemory } from '../memory.js'

beforeEach(() => { createTestDb() })
afterEach(() => resetTestDb())

function seed() {
  const db = getDb()
  db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_1','test ws')").run()
  db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_1','ws_1','test proj')").run()
}

describe('parseCoSResponse — plain JSON', () => {
  it('parses a plain JSON string', () => {
    const raw = JSON.stringify({ next_action: 'continue', reasoning: 'looks good' })
    const result = parseCoSResponse(raw)
    expect(result.next_action).toBe('continue')
    expect(result.reasoning).toBe('looks good')
  })

  it('parses task_updates array from JSON', () => {
    const raw = JSON.stringify({
      task_updates: [{ task_id: 'task_1', status: 'completed' }],
    })
    const result = parseCoSResponse(raw)
    expect(result.task_updates).toHaveLength(1)
    expect(result.task_updates![0].task_id).toBe('task_1')
    expect(result.task_updates![0].status).toBe('completed')
  })

  it('parses memory_writes array from JSON', () => {
    const raw = JSON.stringify({
      memory_writes: [{ content: 'Decided to use PostgreSQL', kind: 'decision' }],
    })
    const result = parseCoSResponse(raw)
    expect(result.memory_writes).toHaveLength(1)
    expect(result.memory_writes![0].content).toBe('Decided to use PostgreSQL')
    expect(result.memory_writes![0].kind).toBe('decision')
  })

  it('returns empty object for empty JSON object', () => {
    const result = parseCoSResponse('{}')
    expect(result).toEqual({})
  })
})

describe('parseCoSResponse — markdown code block extraction', () => {
  it('extracts JSON from a ```json code block', () => {
    const raw = 'Here is the response:\n```json\n{"next_action":"stop","reasoning":"done"}\n```'
    const result = parseCoSResponse(raw)
    expect(result.next_action).toBe('stop')
    expect(result.reasoning).toBe('done')
  })

  it('extracts JSON from a plain ``` code block', () => {
    const raw = '```\n{"task_updates":[{"task_id":"t1","status":"running"}]}\n```'
    const result = parseCoSResponse(raw)
    expect(result.task_updates).toHaveLength(1)
    expect(result.task_updates![0].task_id).toBe('t1')
  })

  it('extracts JSON from code block with surrounding text', () => {
    const raw = 'Analysis complete.\n\n```json\n{"reasoning":"all clear"}\n```\n\nEnd of response.'
    const result = parseCoSResponse(raw)
    expect(result.reasoning).toBe('all clear')
  })
})

describe('parseCoSResponse — graceful degradation', () => {
  it('returns { reasoning: raw } for plain text input', () => {
    const raw = 'This is a plain text response with no JSON.'
    const result = parseCoSResponse(raw)
    expect(result).toEqual({ reasoning: raw })
  })

  it('returns { reasoning: raw } for invalid JSON', () => {
    const raw = '{ invalid json here }'
    const result = parseCoSResponse(raw)
    expect(result).toEqual({ reasoning: raw })
  })

  it('returns { reasoning: raw } for empty string', () => {
    const result = parseCoSResponse('')
    expect(result).toMatchObject({ reasoning: '' })
  })

  it('never throws for any input', () => {
    const inputs = [
      'null',
      'undefined',
      '12345',
      '```json\n{broken\n```',
      '```json\nnull\n```',
      '```json\n[1,2,3]\n```',
    ]
    for (const input of inputs) {
      expect(() => parseCoSResponse(input)).not.toThrow()
    }
  })

  it('validates shape: task_updates must be array', () => {
    const raw = JSON.stringify({ task_updates: 'not an array' })
    const result = parseCoSResponse(raw)
    // Not a valid shape — should fall through to reasoning
    expect(result).toEqual({ reasoning: raw })
  })

  it('validates shape: memory_writes must be array', () => {
    const raw = JSON.stringify({ memory_writes: { content: 'bad' } })
    const result = parseCoSResponse(raw)
    expect(result).toEqual({ reasoning: raw })
  })
})

describe('applyCoSResponse — task updates', () => {
  it('updates task status and returns tasks_updated count', async () => {
    seed()
    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'My task' })
    const db = getDb()

    const response = parseCoSResponse(JSON.stringify({
      task_updates: [{ task_id: task.task_id, status: 'completed' }],
    }))
    const result = await applyCoSResponse(db, 'ws_1', response)

    expect(result.tasks_updated).toBe(1)

    const row = db.prepare('SELECT status, status_category FROM tasks WHERE task_id = ?')
      .get(task.task_id) as { status: string; status_category: string }
    expect(row.status).toBe('completed')
    expect(row.status_category).toBe('done')
  })

  it('updates task title', async () => {
    seed()
    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Old title' })
    const db = getDb()

    await applyCoSResponse(db, 'ws_1', {
      task_updates: [{ task_id: task.task_id, title: 'New title' }],
    })

    const row = db.prepare('SELECT title FROM tasks WHERE task_id = ?')
      .get(task.task_id) as { title: string }
    expect(row.title).toBe('New title')
  })

  it('updates task description', async () => {
    seed()
    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    const db = getDb()

    await applyCoSResponse(db, 'ws_1', {
      task_updates: [{ task_id: task.task_id, description: 'New description' }],
    })

    const row = db.prepare('SELECT description FROM tasks WHERE task_id = ?')
      .get(task.task_id) as { description: string }
    expect(row.description).toBe('New description')
  })

  it('does not update tasks from a different workspace', async () => {
    seed()
    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    const db = getDb()

    const result = await applyCoSResponse(db, 'ws_2', {
      task_updates: [{ task_id: task.task_id, status: 'completed' }],
    })

    expect(result.tasks_updated).toBe(0)
    const row = db.prepare('SELECT status FROM tasks WHERE task_id = ?')
      .get(task.task_id) as { status: string }
    expect(row.status).toBe('queued')
  })

  it('skips task_updates entries without task_id', async () => {
    seed()
    const db = getDb()

    const result = await applyCoSResponse(db, 'ws_1', {
      task_updates: [{ task_id: '' }],
    })

    expect(result.tasks_updated).toBe(0)
  })

  it('returns 0 when task_updates is empty', async () => {
    seed()
    const db = getDb()
    const result = await applyCoSResponse(db, 'ws_1', { task_updates: [] })
    expect(result.tasks_updated).toBe(0)
  })
})

describe('applyCoSResponse — memory writes', () => {
  it('writes a memory and returns memories_written count', async () => {
    seed()
    const db = getDb()

    const result = await applyCoSResponse(db, 'ws_1', {
      memory_writes: [{ content: 'We decided to use SQLite for storage' }],
    })

    expect(result.memories_written).toBe(1)

    const row = db.prepare('SELECT content, kind, scope FROM memories WHERE workspace_id = ?')
      .get('ws_1') as { content: string; kind: string; scope: string }
    expect(row.content).toBe('We decided to use SQLite for storage')
    expect(row.kind).toBe('fact')
    expect(row.scope).toBe('project')
  })

  it('uses explicit kind and scope when provided', async () => {
    seed()
    const db = getDb()

    await applyCoSResponse(db, 'ws_1', {
      memory_writes: [{ content: 'Use TypeScript everywhere', kind: 'decision', scope: 'global' }],
    })

    const row = db.prepare('SELECT kind, scope FROM memories WHERE workspace_id = ?')
      .get('ws_1') as { kind: string; scope: string }
    expect(row.kind).toBe('decision')
    expect(row.scope).toBe('global')
  })

  it('writes multiple memories', async () => {
    seed()
    const db = getDb()

    const result = await applyCoSResponse(db, 'ws_1', {
      memory_writes: [
        { content: 'First observation about the system' },
        { content: 'Second observation about performance' },
      ],
    })

    expect(result.memories_written).toBe(2)
    const count = (db.prepare('SELECT COUNT(*) as c FROM memories WHERE workspace_id = ?')
      .get('ws_1') as { c: number }).c
    expect(count).toBe(2)
  })

  it('skips memory writes with empty content', async () => {
    seed()
    const db = getDb()

    const result = await applyCoSResponse(db, 'ws_1', {
      memory_writes: [{ content: '' }, { content: '   ' }],
    })

    expect(result.memories_written).toBe(0)
  })

  it('generates a memory_id with mem_ prefix', async () => {
    seed()
    const db = getDb()

    await applyCoSResponse(db, 'ws_1', {
      memory_writes: [{ content: 'Test memory content' }],
    })

    const row = db.prepare('SELECT memory_id FROM memories WHERE workspace_id = ?')
      .get('ws_1') as { memory_id: string }
    expect(row.memory_id).toMatch(/^mem_[0-9A-Z]{26}$/)
  })

  it('returns 0 when memory_writes is empty', async () => {
    seed()
    const db = getDb()
    const result = await applyCoSResponse(db, 'ws_1', { memory_writes: [] })
    expect(result.memories_written).toBe(0)
  })
})

describe('applyCoSResponse — memory writes (K-1, K-3) delegate to writeMemory', () => {
  it('applyCoSResponse creates memories with mem_ prefix', async () => {
    seed()
    const db = getDb()
    const result = await applyCoSResponse(db, 'ws_1', {
      memory_writes: [{ content: 'prefix check', kind: 'fact', scope: 'project' }],
    })
    expect(result.memories_written).toBe(1)
    const row = db.prepare(`SELECT memory_id FROM memories LIMIT 1`).get() as { memory_id: string }
    expect(row.memory_id).toMatch(/^mem_[0-9A-Z]{26}$/)
  })

  it('CoS-written memories have freshness set (not NULL)', async () => {
    seed()
    const db = getDb()
    await applyCoSResponse(db, 'ws_1', {
      memory_writes: [{ content: 'freshness check', kind: 'fact', scope: 'project' }],
    })
    const row = db.prepare(`SELECT freshness FROM memories LIMIT 1`).get() as { freshness: number | null }
    expect(row.freshness).not.toBeNull()
    expect(row.freshness).toBeGreaterThan(0)
  })

  it('CoS-written memories have importance set (not NULL)', async () => {
    seed()
    const db = getDb()
    await applyCoSResponse(db, 'ws_1', {
      memory_writes: [{ content: 'importance check', kind: 'fact', scope: 'project' }],
    })
    const row = db.prepare(`SELECT importance FROM memories LIMIT 1`).get() as { importance: number | null }
    expect(row.importance).not.toBeNull()
    expect(row.importance).toBeGreaterThan(0)
  })

  it('CoS-written memories appear in recallMemory results', async () => {
    seed()
    const db = getDb()
    await applyCoSResponse(db, 'ws_1', {
      memory_writes: [{ content: 'findable content for recall', kind: 'fact', scope: 'project' }],
    })
    const results = await recallMemory({
      query: 'findable content',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
    })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].memory_id).toMatch(/^mem_/)
  })
})

describe('applyCoSResponse — combined updates', () => {
  it('handles both task_updates and memory_writes in one call', async () => {
    seed()
    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Combined task' })
    const db = getDb()

    const result = await applyCoSResponse(db, 'ws_1', {
      task_updates: [{ task_id: task.task_id, status: 'running' }],
      memory_writes: [{ content: 'Task is now running' }],
    })

    expect(result.tasks_updated).toBe(1)
    expect(result.memories_written).toBe(1)
  })

  it('handles response with no task_updates or memory_writes', async () => {
    seed()
    const db = getDb()

    const result = await applyCoSResponse(db, 'ws_1', {
      next_action: 'wait',
      reasoning: 'Waiting for dependencies',
    })

    expect(result.tasks_updated).toBe(0)
    expect(result.memories_written).toBe(0)
  })
})
