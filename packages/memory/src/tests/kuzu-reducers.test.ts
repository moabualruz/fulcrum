// v2a PR 7 Tasks 37 + 38 — Kuzu reducer unit tests.
//
// These tests exercise the pure-data edge cases of the reducers without
// requiring a live Kuzu instance. Integration with a real Kuzu DB is
// covered by the existing kuzu-*.test.ts suite via setKuzuClient().

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { setKuzuClient, getKuzuClient, type KuzuClient } from '../kuzu/client.js'
import { reduceFileToGraph, reduceUnlinkToGraph } from '../kuzu/reducers/code.js'
import { reduceMemoryWrite, extractWikilinkRefs } from '../kuzu/reducers/memory.js'

// ── Minimal Kuzu stub — records queries so assertions can inspect them ───
interface RecordedQuery { cypher: string; params?: Record<string, unknown> }
function makeStubClient(): KuzuClient & { _calls: RecordedQuery[] } {
  const calls: RecordedQuery[] = []
  const stub = {
    _calls: calls,
    query: async <T = Record<string, unknown>>(cypher: string, params?: Record<string, unknown>): Promise<T[]> => {
      calls.push({ cypher, params })
      return [] as T[]
    },
  }
  return stub as unknown as KuzuClient & { _calls: RecordedQuery[] }
}

describe('Kuzu code reducer (Task 37)', () => {
  let db: Database.Database
  const workspaceId = 'ws_1'
  const projectId = 'proj_1'

  beforeEach(() => {
    db = createTestDb()
    seedWorkspaceAndProject(db, workspaceId, projectId)
  })

  afterEach(() => {
    setKuzuClient(null)
    resetTestDb()
  })

  it('returns "no-kuzu" when KuzuClient is not wired', async () => {
    setKuzuClient(null)
    const result = await reduceFileToGraph(db, 'missing')
    expect(result).toBe('no-kuzu')
  })

  it('returns "missing" when file_id is not in code_files', async () => {
    const stub = makeStubClient()
    setKuzuClient(stub)
    const result = await reduceFileToGraph(db, 'does-not-exist')
    expect(result).toBe('missing')
  })

  it('projects File + CodeChunk + Symbol into Kuzu when rows exist', async () => {
    const stub = makeStubClient()
    setKuzuClient(stub)

    db.prepare(`INSERT INTO code_files (file_id, workspace_id, project_id, rel_path, language, sha256, mtime_ns, size_bytes, chunks_count, indexed_at)
      VALUES ('f1', ?, ?, 'src/a.ts', 'typescript', 'sha-a', 0, 100, 0, 0)`).run(workspaceId, projectId)
    db.prepare(`INSERT INTO code_chunks (chunk_id, workspace_id, project_id, file_path, file_id, language, chunk_strategy, source_type, content, start_line, end_line, symbol_path, content_hash)
      VALUES ('c1', ?, ?, 'src/a.ts', 'f1', 'typescript', 'syntax', 'code', 'export function foo() {}', 1, 1, 'foo', 'hash-a')`).run(workspaceId, projectId)
    db.prepare(`INSERT INTO code_symbols (file_id, name, kind, line)
      VALUES ('f1', 'foo', 'function', 1)`).run()

    const result = await reduceFileToGraph(db, 'f1')
    expect(result).toBe('ok')
    // File, CodeChunk, Symbol node inserts (CREATE queries) recorded.
    const createFile = stub._calls.find(q => q.cypher.includes('CREATE (f:File'))
    expect(createFile).toBeDefined()
    const createChunk = stub._calls.find(q => q.cypher.includes('CREATE (c:CodeChunk'))
    expect(createChunk).toBeDefined()
    const createSymbol = stub._calls.find(q => q.cypher.includes('CREATE (s:Symbol'))
    expect(createSymbol).toBeDefined()
    // CONTAINED_IN + DEFINES edges.
    expect(stub._calls.some(q => q.cypher.includes('CONTAINED_IN'))).toBe(true)
    expect(stub._calls.some(q => q.cypher.includes('DEFINES'))).toBe(true)
  })

  it('reduceUnlinkToGraph issues a DETACH DELETE', async () => {
    const stub = makeStubClient()
    setKuzuClient(stub)
    const result = await reduceUnlinkToGraph('f1')
    expect(result).toBe('ok')
    expect(stub._calls.some(q => q.cypher.includes('DETACH DELETE'))).toBe(true)
  })
})

describe('Kuzu memory reducer (Task 38)', () => {
  let db: Database.Database
  const workspaceId = 'ws_1'
  const projectId = 'proj_1'

  beforeEach(() => {
    db = createTestDb()
    seedWorkspaceAndProject(db, workspaceId, projectId)
  })

  afterEach(() => {
    setKuzuClient(null)
    resetTestDb()
  })

  it('returns "no-kuzu" when client is absent', async () => {
    setKuzuClient(null)
    const result = await reduceMemoryWrite(db, {
      memoryId: 'm1', workspaceId, projectId, kind: 'decision', content: '',
    })
    expect(result).toBe('no-kuzu')
  })

  it('file_patch with file_paths emits EDITS edges for each known file', async () => {
    const stub = makeStubClient()
    setKuzuClient(stub)

    db.prepare(`INSERT INTO code_files (file_id, workspace_id, project_id, rel_path, language, sha256, mtime_ns, size_bytes, chunks_count, indexed_at)
      VALUES ('f1', ?, ?, 'src/a.ts', 'typescript', 's', 0, 10, 0, 0)`).run(workspaceId, projectId)

    const result = await reduceMemoryWrite(db, {
      memoryId: 'm1', workspaceId, projectId, kind: 'file_patch',
      content: 'changed src/a.ts',
      filePaths: ['src/a.ts', 'src/missing.ts'],
    })
    expect(result).toBe('ok')
    const editsCalls = stub._calls.filter(q => q.cypher.includes('EDITS'))
    expect(editsCalls.length).toBe(1) // only known file
    expect(editsCalls[0]!.params?.['fid']).toBe('f1')
  })

  it('decision memory with [[file:...]] wikilink emits ABOUT_FILE edge', async () => {
    const stub = makeStubClient()
    setKuzuClient(stub)

    db.prepare(`INSERT INTO code_files (file_id, workspace_id, project_id, rel_path, language, sha256, mtime_ns, size_bytes, chunks_count, indexed_at)
      VALUES ('f1', ?, ?, 'src/a.ts', 'typescript', 's', 0, 10, 0, 0)`).run(workspaceId, projectId)

    const result = await reduceMemoryWrite(db, {
      memoryId: 'm1', workspaceId, projectId, kind: 'decision',
      content: 'Decided to refactor [[file:src/a.ts]] because…',
    })
    expect(result).toBe('ok')
    expect(stub._calls.some(q => q.cypher.includes('ABOUT_FILE'))).toBe(true)
  })

  it('decision memory with [[symbol:...]] emits ABOUT_SYMBOL + MENTIONS_SYMBOL', async () => {
    const stub = makeStubClient()
    setKuzuClient(stub)

    db.prepare(`INSERT INTO code_files (file_id, workspace_id, project_id, rel_path, language, sha256, mtime_ns, size_bytes, chunks_count, indexed_at)
      VALUES ('f1', ?, ?, 'src/a.ts', 'typescript', 's', 0, 10, 0, 0)`).run(workspaceId, projectId)
    db.prepare(`INSERT INTO code_symbols (file_id, name, kind, line) VALUES ('f1', 'foo', 'function', 1)`).run()

    const result = await reduceMemoryWrite(db, {
      memoryId: 'm1', workspaceId, projectId, kind: 'decision',
      content: 'The function [[symbol:foo]] handles X.',
    })
    expect(result).toBe('ok')
    expect(stub._calls.some(q => q.cypher.includes('ABOUT_SYMBOL'))).toBe(true)
    expect(stub._calls.some(q => q.cypher.includes('MENTIONS_SYMBOL'))).toBe(true)
  })

  it('extractWikilinkRefs parses file + symbol refs', () => {
    const refs = extractWikilinkRefs('See [[file:src/a.ts]] and [[symbol:handler]].')
    expect(refs).toEqual([
      { kind: 'file', value: 'src/a.ts' },
      { kind: 'symbol', value: 'handler' },
    ])
  })

  it('extractWikilinkRefs ignores unknown kinds', () => {
    const refs = extractWikilinkRefs('See [[task:t1]] and [[file:src/a.ts]].')
    expect(refs).toEqual([{ kind: 'file', value: 'src/a.ts' }])
  })
})
