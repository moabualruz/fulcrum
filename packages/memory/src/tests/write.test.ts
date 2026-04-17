// packages/memory/src/tests/write.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-core'
import { writeMemory } from '../write.js'
import { contentHash } from '../dedup.js'

beforeEach(() => { createTestDb() })
afterEach(() => resetTestDb())

describe('writeMemory — input validation', () => {
  it('throws invalid_input for empty title', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    await expect(writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      scope: 'project', kind: 'fact',
      title: '', summary: 'summary', content: 'content',
    })).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('throws invalid_input for empty content', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    await expect(writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      scope: 'project', kind: 'fact',
      title: 'title', summary: 'summary', content: '',
    })).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('throws invalid_input for confidence out of range', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    await expect(writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      scope: 'project', kind: 'fact',
      title: 't', summary: 's', content: 'c', confidence: 1.5,
    })).rejects.toMatchObject({ code: 'invalid_input' })
  })
})

describe('writeMemory — insert', () => {
  it('persists all fields and returns FullMemory', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const m = await writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      scope: 'project', kind: 'decision',
      title: 'Use SQLite', summary: 'Local-first storage decision',
      content: 'We chose SQLite because it is local-first and has zero config.',
      tags: ['architecture'], confidence: 0.9,
    })
    expect(m.memory_id).toMatch(/^mem_[0-9A-Z]{26}$/)
    expect(m.scope).toBe('project')
    expect(m.kind).toBe('decision')
    expect(m.title).toBe('Use SQLite')
    expect(m.summary).toBe('Local-first storage decision')
    expect(m.canonical_text).toBe('We chose SQLite because it is local-first and has zero config.')
    expect(m.tags).toEqual(['architecture'])
    expect(m.confidence).toBeCloseTo(0.9)
    expect(m.access_count).toBe(0)
    expect(m.content_hash).toBe(contentHash('We chose SQLite because it is local-first and has zero config.'))
  })

  it('stores content_hash on insert', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    await writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      scope: 'project', kind: 'fact',
      title: 't', summary: 's', content: 'hello world',
    })
    const row = db.prepare('SELECT content_hash FROM memories LIMIT 1').get() as { content_hash: string }
    expect(row.content_hash).toBe(contentHash('hello world'))
  })
})

describe('writeMemory — deduplication', () => {
  it('increments access_count instead of inserting a duplicate (same content_hash)', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    await writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      scope: 'project', kind: 'fact',
      title: 'Original', summary: 's', content: 'duplicate test content',
    })
    const result = await writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      scope: 'project', kind: 'fact',
      title: 'Duplicate', summary: 's2', content: 'duplicate test content',
    })
    const count = (db.prepare('SELECT COUNT(*) as c FROM memories').get() as { c: number }).c
    expect(count).toBe(1)
    expect(result.access_count).toBe(1)
  })

  it('preserves original title/summary on dedup hit', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    await writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      scope: 'project', kind: 'fact',
      title: 'Original Title', summary: 'Original Summary', content: 'same',
    })
    const result = await writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      scope: 'project', kind: 'fact',
      title: 'New Title', summary: 'New Summary', content: 'same',
    })
    expect(result.title).toBe('Original Title')
    expect(result.summary).toBe('Original Summary')
  })

  it('does not dedup across different projects', async () => {
    const db = getDb()
    db.prepare("INSERT OR IGNORE INTO workspaces(workspace_id,name) VALUES ('ws_1','ws1')").run()
    db.prepare("INSERT OR IGNORE INTO projects(project_id,workspace_id,name) VALUES ('proj_1','ws_1','p1')").run()
    db.prepare("INSERT OR IGNORE INTO projects(project_id,workspace_id,name) VALUES ('proj_2','ws_1','p2')").run()
    await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', scope: 'project', kind: 'fact', title: 't', summary: 's', content: 'same' })
    await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_2', scope: 'project', kind: 'fact', title: 't', summary: 's', content: 'same' })
    const count = (db.prepare('SELECT COUNT(*) as c FROM memories').get() as { c: number }).c
    expect(count).toBe(2)
  })
})

describe('writeMemory — optional fields', () => {
  it('stores file_path and symbol_path', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const m = await writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      scope: 'file', kind: 'symbol',
      title: 'MyClass.myMethod', summary: 'method summary',
      content: 'function implementation',
      file_path: 'src/my-class.ts', symbol_path: 'MyClass.myMethod',
    })
    expect(m.file_path).toBe('src/my-class.ts')
    expect(m.symbol_path).toBe('MyClass.myMethod')
  })

  it('stores task_id link', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const m = await writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      scope: 'project', kind: 'task_goal',
      title: 'Goal', summary: 'goal summary', content: 'task content',
      task_id: 'task_abc123',
    })
    expect(m.task_id).toBe('task_abc123')
  })
})

describe('writeMemory — freshness', () => {
  it('newly written memory has freshness close to 1.0 (computed from updated_at)', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const m = await writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      scope: 'project', kind: 'fact',
      title: 'Fresh memory', summary: 's', content: 'fresh content',
    })
    // freshness is now computed from updated_at at query time — newly written rows get ~1.0
    expect(m.freshness).toBeCloseTo(1.0, 1)
  })

  it('explicit freshness input is ignored — returned value computed from updated_at', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const m = await writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      scope: 'project', kind: 'fact',
      title: 'Stale memory', summary: 's', content: 'half-fresh content',
      // passing freshness: 0.5 is deprecated — should be ignored
      freshness: 0.5,
    })
    // The returned freshness is computed from updated_at (just now), so it should be ~1.0, NOT 0.5
    expect(m.freshness).toBeCloseTo(1.0, 1)
    // The DB column does NOT store the caller-supplied value (0.5 is not in the DB)
    const row = db.prepare('SELECT freshness FROM memories WHERE memory_id = ?').get(m.memory_id) as { freshness: number | null }
    // Column may be NULL or have a schema default — either way it should NOT be 0.5
    expect(row.freshness).not.toBeCloseTo(0.5)
  })
})

describe('writeMemory — importance', () => {
  it('newly written memory has importance === 0.5 by default', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const m = await writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      scope: 'project', kind: 'fact',
      title: 'Default importance', summary: 's', content: 'default importance content',
    })
    expect(m.importance).toBeCloseTo(0.5)
    // Verify it is persisted to the DB
    const row = db.prepare('SELECT importance FROM memories WHERE memory_id = ?').get(m.memory_id) as { importance: number }
    expect(row.importance).toBeCloseTo(0.5)
  })

  it('stores explicit importance value', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const m = await writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      scope: 'project', kind: 'decision',
      title: 'High importance decision', summary: 's', content: 'critical architecture decision',
      importance: 0.9,
    })
    expect(m.importance).toBeCloseTo(0.9)
    // Verify it is persisted to the DB
    const row = db.prepare('SELECT importance FROM memories WHERE memory_id = ?').get(m.memory_id) as { importance: number }
    expect(row.importance).toBeCloseTo(0.9)
  })

  it('throws invalid_input for importance below 0', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    await expect(writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      scope: 'project', kind: 'fact',
      title: 't', summary: 's', content: 'c', importance: -0.1,
    })).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('throws invalid_input for importance above 1', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    await expect(writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      scope: 'project', kind: 'fact',
      title: 't', summary: 's', content: 'c', importance: 1.5,
    })).rejects.toMatchObject({ code: 'invalid_input' })
  })
})

describe('memory_id prefix (J-1)', () => {
  it('writeMemory returns an id starting with mem_', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const m = await writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      scope: 'project', kind: 'fact',
      title: 'prefix check', summary: 's', content: 'prefix check',
    })
    expect(m.memory_id).toMatch(/^mem_/)
  })

  it('persisted memory rows have mem_ prefix', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    await writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      scope: 'project', kind: 'fact',
      title: 'prefix check 2', summary: 's', content: 'prefix check 2',
    })
    const row = getDb().prepare('SELECT memory_id FROM memories LIMIT 1').get() as { memory_id: string }
    expect(row.memory_id).toMatch(/^mem_/)
  })
})
