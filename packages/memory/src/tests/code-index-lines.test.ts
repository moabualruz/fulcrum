import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { indexCodeFile } from '../l2/code.js'
import { searchCode } from '../retrieval/search-code.js'

describe('code index line attribution', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
    seedWorkspaceAndProject(db, 'ws_1', 'proj_1')
  })

  afterEach(() => resetTestDb())

  it('replaces stale chunks and search returns current path and line range', async () => {
    await indexCodeFile({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      rel_path: 'src/current.ts',
      content: 'export function stale() {\n  return "old"\n}\n',
      language: 'typescript',
    }, db)

    const before = db.prepare(`
      SELECT content_hash
      FROM code_chunks
      WHERE project_id = 'proj_1' AND file_path = 'src/current.ts'
    `).all() as Array<{ content_hash: string }>

    await indexCodeFile({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      rel_path: 'src/current.ts',
      content: [
        'const intro = true',
        '',
        'export function currentLineTarget() {',
        '  return "new current marker"',
        '}',
        '',
      ].join('\n'),
      language: 'typescript',
    }, db)

    const after = db.prepare(`
      SELECT content_hash, start_line, end_line
      FROM code_chunks
      WHERE project_id = 'proj_1' AND file_path = 'src/current.ts'
      ORDER BY start_line
    `).all() as Array<{ content_hash: string; start_line: number; end_line: number }>

    expect(after.length).toBeGreaterThan(0)
    for (const oldChunk of before) {
      expect(after.some(chunk => chunk.content_hash === oldChunk.content_hash)).toBe(false)
    }

    const out = await searchCode({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      text: 'current marker',
    }, db)

    expect(out.results).toHaveLength(1)
    expect(out.results[0]!.rel_path).toBe('src/current.ts')
    expect(out.results[0]!.start_line).toBeGreaterThanOrEqual(1)
    expect(out.results[0]!.end_line).toBeGreaterThanOrEqual(out.results[0]!.start_line)
    expect(out.results[0]!.code_index_state).toBe('current')
  })

  it('updates line ranges when unchanged chunk content moves within a changed file', async () => {
    await indexCodeFile({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      rel_path: 'src/moved.ts',
      content: 'v1',
      language: 'typescript',
      chunker: () => [
        {
          text: 'stable target same body',
          strategy: 'syntax',
          sourceType: 'code',
          symbolPath: 'stableTarget',
          startLine: 1,
          endLine: 3,
        },
      ],
    }, db)

    await indexCodeFile({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      rel_path: 'src/moved.ts',
      content: 'v2',
      language: 'typescript',
      chunker: () => [
        {
          text: 'stable target same body',
          strategy: 'syntax',
          sourceType: 'code',
          symbolPath: 'stableTarget',
          startLine: 3,
          endLine: 5,
        },
      ],
    }, db)

    const out = await searchCode({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      text: 'same body',
    }, db)

    expect(out.results).toHaveLength(1)
    expect(out.results[0]!.rel_path).toBe('src/moved.ts')
    expect(out.results[0]!.start_line).toBe(3)
  })

  it('keeps duplicate chunks that share the same content hash', async () => {
    await indexCodeFile({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      rel_path: 'src/duplicates.ts',
      content: 'v1',
      language: 'typescript',
      chunker: () => [
        {
          text: 'same repeated body',
          strategy: 'syntax',
          sourceType: 'code',
          symbolPath: 'first',
          startLine: 1,
          endLine: 2,
        },
      ],
    }, db)

    await indexCodeFile({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      rel_path: 'src/duplicates.ts',
      content: 'v2',
      language: 'typescript',
      chunker: () => [
        {
          text: 'same repeated body',
          strategy: 'syntax',
          sourceType: 'code',
          symbolPath: 'first',
          startLine: 1,
          endLine: 2,
        },
        {
          text: 'same repeated body',
          strategy: 'syntax',
          sourceType: 'code',
          symbolPath: 'second',
          startLine: 10,
          endLine: 11,
        },
      ],
    }, db)

    const rows = db.prepare(`
      SELECT symbol_path, start_line, end_line
      FROM code_chunks
      WHERE project_id = 'proj_1' AND file_path = 'src/duplicates.ts'
      ORDER BY start_line
    `).all() as Array<{ symbol_path: string; start_line: number; end_line: number }>

    expect(rows).toEqual([
      { symbol_path: 'first', start_line: 1, end_line: 2 },
      { symbol_path: 'second', start_line: 10, end_line: 11 },
    ])
  })
})
