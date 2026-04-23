import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { computeFileId, contentSha256, indexCodeFile } from '../l2/code.js'

describe('code index failure state', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
    seedWorkspaceAndProject(db, 'ws_1', 'proj_1')
  })

  afterEach(() => resetTestDb())

  it('records parser/index failures on code_files and clears ambiguous partial chunks', async () => {
    const result = await indexCodeFile({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      rel_path: 'src/broken.ts',
      content: 'export function broken() { return 1 }',
      language: 'typescript',
      chunker: async () => {
        throw new Error('parser exploded')
      },
    }, db)

    expect(result.status).toBe('failed')
    expect(result.failure_reason).toContain('parser exploded')

    const file = db.prepare(`
      SELECT status, failure_reason, chunks_count
      FROM code_files
      WHERE project_id = 'proj_1' AND rel_path = 'src/broken.ts'
    `).get() as { status: string; failure_reason: string; chunks_count: number }
    expect(file.status).toBe('failed')
    expect(file.failure_reason).toContain('parser exploded')
    expect(file.chunks_count).toBe(0)

    const chunks = db.prepare(`
      SELECT COUNT(*) AS n
      FROM code_chunks
      WHERE project_id = 'proj_1' AND file_path = 'src/broken.ts'
    `).get() as { n: number }
    expect(chunks.n).toBe(0)
  })

  it('repairs an indexed file row whose chunk rows were never written', async () => {
    const content = 'export function repaired() {\n  return true\n}\n'
    db.prepare(`
      INSERT INTO code_files (
        file_id, workspace_id, project_id, rel_path, language, sha256,
        mtime_ns, size_bytes, chunks_count, indexed_at, status
      ) VALUES (
        ?, 'ws_1', 'proj_1', 'src/repaired.ts', 'typescript', ?,
        1, ?, 0, 1, 'indexed'
      )
    `).run(computeFileId('proj_1', 'src/repaired.ts'), contentSha256(content), Buffer.byteLength(content, 'utf8'))

    const result = await indexCodeFile({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      rel_path: 'src/repaired.ts',
      content,
      language: 'typescript',
    }, db)

    expect(result.status).toBe('indexed')
    expect(result.chunks_count).toBeGreaterThan(0)

    const file = db.prepare(`
      SELECT chunks_count
      FROM code_files
      WHERE project_id = 'proj_1' AND rel_path = 'src/repaired.ts'
    `).get() as { chunks_count: number }
    expect(file.chunks_count).toBe(result.chunks_count)
  })

  it('removes stale chunks when an indexed file becomes empty', async () => {
    const fileId = computeFileId('proj_1', 'src/empty.ts')
    db.prepare(`
      INSERT INTO code_files (
        file_id, workspace_id, project_id, rel_path, language, sha256,
        mtime_ns, size_bytes, chunks_count, indexed_at, status
      ) VALUES (?, 'ws_1', 'proj_1', 'src/empty.ts', 'typescript', ?, 1, 0, 1, 1, 'indexed')
    `).run(fileId, contentSha256(''))
    db.prepare(`
      INSERT INTO code_chunks (
        chunk_id, workspace_id, project_id, file_path, file_id, language,
        chunk_strategy, source_type, content, start_line, end_line, indexed_at
      ) VALUES (
        'stale_chunk', 'ws_1', 'proj_1', 'src/empty.ts', ?, 'typescript',
        'syntax', 'code', 'stale content', 1, 1, '2026-04-17T00:00:00Z'
      )
    `).run(fileId)

    const result = await indexCodeFile({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      rel_path: 'src/empty.ts',
      content: '',
      language: 'typescript',
    }, db)

    expect(result.chunks_count).toBe(0)

    const chunks = db.prepare(`
      SELECT COUNT(*) AS n
      FROM code_chunks
      WHERE project_id = 'proj_1' AND file_path = 'src/empty.ts'
    `).get() as { n: number }
    expect(chunks.n).toBe(0)
  })
})
