import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { setDb, closeDb, _configureDb } from 'fulcrum-core'
import { runMigrations } from 'fulcrum-core'
import { writeMemory } from '../write.js'
import { queryMemory } from '../query-memory.js'

function freshDb() {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  return db
}

describe('queryMemory — v2a PR 2 Task 12', () => {
  let db: Database.Database
  beforeEach(() => {
    db = freshDb()
    db.prepare(`INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1','w','active','2026-04-17T00:00:00Z')`).run()
    db.prepare(`INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_1','ws_1','p','git','active','worktree','2026-04-17T00:00:00Z')`).run()
  })
  afterEach(() => closeDb())

  async function seed(content: string, opts: { kind?: string; tags?: string[]; file_path?: string } = {}): Promise<string> {
    const m = await writeMemory({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      scope: 'project',
      kind: (opts.kind ?? 'fact'),
      title: content.slice(0, 30),
      summary: '',
      content,
      tags: opts.tags ?? [],
      file_path: opts.file_path,
      skipVaultWrite: true,
    } as Parameters<typeof writeMemory>[0], db)
    if (opts.tags) {
      for (const t of opts.tags) {
        db.prepare('INSERT OR IGNORE INTO memory_tags (memory_id, tag) VALUES (?,?)').run(m.memory_id, t)
      }
    }
    return m.memory_id
  }

  it('returns reason=no_match when nothing matches', async () => {
    const out = await queryMemory({ workspace_id: 'ws_1', project_id: 'proj_1', kind: 'symbol' })
    expect(out.results).toEqual([])
    expect(out.reason).toBe('no_match')
  })

  it('filters by kind', async () => {
    await seed('decision content', { kind: 'decision' })
    await seed('fact content', { kind: 'fact' })
    const out = await queryMemory({ workspace_id: 'ws_1', project_id: 'proj_1', kind: 'decision' })
    expect(out.results).toHaveLength(1)
    expect(out.results[0]!.kind).toBe('decision')
  })

  it('filters by tags (intersection — all tags must match)', async () => {
    await seed('a', { tags: ['arch'] })
    await seed('b', { tags: ['arch', 'safety'] })
    const out = await queryMemory({ workspace_id: 'ws_1', project_id: 'proj_1', tags: ['arch', 'safety'] })
    expect(out.results).toHaveLength(1)
    expect(out.results[0]!.content).toBe('b')
  })

  it('filters by file_paths', async () => {
    await seed('content1', { file_path: 'src/a.ts' })
    await seed('content2', { file_path: 'src/b.ts' })
    const out = await queryMemory({ workspace_id: 'ws_1', project_id: 'proj_1', file_paths: ['src/a.ts'] })
    expect(out.results).toHaveLength(1)
    expect(out.results[0]!.content).toBe('content1')
  })

  it('returns wikilink-resolved backlinks via memory_wikilinks', async () => {
    const targetId = await seed('canonical decision')
    const sourceId = await seed('discusses canonical')
    db.prepare('INSERT INTO memory_wikilinks (src_memory_id, dst_slug, dst_memory_id) VALUES (?,?,?)').run(sourceId, 'canonical', targetId)
    const out = await queryMemory({ workspace_id: 'ws_1', project_id: 'proj_1', linked_to: targetId })
    expect(out.results).toHaveLength(1)
    expect(out.results[0]!.memory_id).toBe(sourceId)
  })

  it('FTS5 text filter works', async () => {
    await seed('foo bar baz')
    await seed('hello world')
    const out = await queryMemory({ workspace_id: 'ws_1', project_id: 'proj_1', text: 'foo' })
    expect(out.results.length).toBeGreaterThan(0)
    expect(out.results[0]!.content).toContain('foo')
  })

  it('inserts memory_recall_events with source=query_memory', async () => {
    await seed('x')
    const before = (db.prepare('SELECT COUNT(*) AS n FROM memory_recall_events').get() as { n: number }).n
    await queryMemory({ workspace_id: 'ws_1', project_id: 'proj_1' })
    const after = (db.prepare('SELECT COUNT(*) AS n FROM memory_recall_events').get() as { n: number }).n
    expect(after).toBeGreaterThan(before)
    const sources = (db.prepare(`SELECT DISTINCT source FROM memory_recall_events`).all() as { source: string }[]).map(r => r.source)
    expect(sources).toContain('query_memory')
  })
})
