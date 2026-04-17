// packages/memory/src/tests/dedup.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { contentHash, isDuplicate } from '../dedup.js'

beforeEach(() => { createTestDb() })
afterEach(() => resetTestDb())

describe('contentHash', () => {
  it('returns a 64-char hex string', () => {
    expect(contentHash('hello')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('same input → same hash', () => {
    expect(contentHash('abc')).toBe(contentHash('abc'))
  })

  it('different inputs → different hashes', () => {
    expect(contentHash('abc')).not.toBe(contentHash('xyz'))
  })
})

describe('isDuplicate', () => {
  it('returns null when no memories exist', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const result = await isDuplicate({ db, workspace_id: 'ws_1', project_id: 'proj_1', hash: contentHash('test content') })
    expect(result).toBeNull()
  })

  it('returns memory_id when a memory with same content_hash exists', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const hash = contentHash('my content')
    db.prepare(`
      INSERT INTO memories(memory_id, workspace_id, project_id, content, title, summary, content_hash)
      VALUES ('mem_1', 'ws_1', 'proj_1', 'my content', 'title', 'summary', ?)
    `).run(hash)

    const result = await isDuplicate({ db, workspace_id: 'ws_1', project_id: 'proj_1', hash })
    expect(result).toBe('mem_1')
  })

  it('does not match across different workspaces', async () => {
    const db = getDb()
    db.prepare("INSERT OR IGNORE INTO workspaces(workspace_id, name) VALUES ('ws_1','ws1')").run()
    db.prepare("INSERT OR IGNORE INTO workspaces(workspace_id, name) VALUES ('ws_2','ws2')").run()
    db.prepare("INSERT OR IGNORE INTO projects(project_id, workspace_id, name) VALUES ('proj_1','ws_1','p1')").run()
    db.prepare("INSERT OR IGNORE INTO projects(project_id, workspace_id, name) VALUES ('proj_2','ws_2','p2')").run()
    const hash = contentHash('shared content')
    db.prepare(`
      INSERT INTO memories(memory_id, workspace_id, project_id, content, title, summary, content_hash)
      VALUES ('mem_1', 'ws_1', 'proj_1', 'shared content', 't', 's', ?)
    `).run(hash)

    const result = await isDuplicate({ db, workspace_id: 'ws_2', project_id: 'proj_2', hash })
    expect(result).toBeNull()
  })

  it('does not match across different projects in same workspace', async () => {
    const db = getDb()
    db.prepare("INSERT OR IGNORE INTO workspaces(workspace_id, name) VALUES ('ws_1','ws1')").run()
    db.prepare("INSERT OR IGNORE INTO projects(project_id, workspace_id, name) VALUES ('proj_1','ws_1','p1')").run()
    db.prepare("INSERT OR IGNORE INTO projects(project_id, workspace_id, name) VALUES ('proj_2','ws_1','p2')").run()
    const hash = contentHash('shared content')
    db.prepare(`
      INSERT INTO memories(memory_id, workspace_id, project_id, content, title, summary, content_hash)
      VALUES ('mem_1', 'ws_1', 'proj_1', 'shared content', 't', 's', ?)
    `).run(hash)

    const result = await isDuplicate({ db, workspace_id: 'ws_1', project_id: 'proj_2', hash })
    expect(result).toBeNull()
  })
})
