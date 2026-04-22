import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { ingestProject } from '../ingest.js'
import { syncFile } from '../pci/syncer.js'

describe('code index parity — batch and incremental', () => {
  let root: string
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
    root = join(tmpdir(), `fulcrum-code-index-parity-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(root, 'src'), { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    resetTestDb()
  })

  function fileSnapshot(projectId: string): Array<Record<string, unknown>> {
    return db.prepare(`
      SELECT rel_path, language, sha256, chunks_count, status, failure_reason
      FROM code_files
      WHERE project_id = ?
      ORDER BY rel_path
    `).all(projectId) as Array<Record<string, unknown>>
  }

  function chunkSnapshot(projectId: string): Array<Record<string, unknown>> {
    return db.prepare(`
      SELECT c.file_path, c.language, c.chunk_strategy, c.source_type, c.content,
             c.start_line, c.end_line, c.symbol_path, c.content_hash,
             CASE WHEN c.file_id IS NULL THEN 'missing' ELSE 'linked' END AS file_link
      FROM code_chunks c
      WHERE c.project_id = ?
      ORDER BY c.file_path, c.start_line, c.end_line, c.content_hash
    `).all(projectId) as Array<Record<string, unknown>>
  }

  it('indexes identical file and chunk contracts through batch and incremental flows', async () => {
    const workspaceId = 'ws_1'
    const batchProjectId = 'proj_batch'
    const incrementalProjectId = 'proj_incremental'
    seedWorkspaceAndProject(db, workspaceId, batchProjectId)
    seedWorkspaceAndProject(db, workspaceId, incrementalProjectId)

    const relPath = 'src/parity.ts'
    const body = [
      'export function alpha() {',
      '  return "same"',
      '}',
      '',
      'export function beta() {',
      '  return alpha()',
      '}',
      '',
    ].join('\n')
    writeFileSync(join(root, relPath), body, 'utf8')

    await ingestProject({ workspace_id: workspaceId, project_id: batchProjectId, root_path: root })
    await syncFile({
      db,
      workspaceId,
      projectId: incrementalProjectId,
      projectRoot: root,
      event: { change_type: 'add', path: join(root, relPath) },
    })

    expect(fileSnapshot(batchProjectId)).toEqual(fileSnapshot(incrementalProjectId))
    expect(chunkSnapshot(batchProjectId)).toEqual(chunkSnapshot(incrementalProjectId))

    for (const projectId of [batchProjectId, incrementalProjectId]) {
      const parity = db.prepare(`
        SELECT COUNT(*) AS n
        FROM code_files f
        WHERE f.project_id = ?
          AND f.chunks_count != (
            SELECT COUNT(*) FROM code_chunks c
            WHERE c.project_id = f.project_id AND c.file_id = f.file_id
          )
      `).get(projectId) as { n: number }
      expect(parity.n).toBe(0)

      const unlinked = db.prepare(`
        SELECT COUNT(*) AS n
        FROM code_chunks
        WHERE project_id = ? AND file_id IS NULL
      `).get(projectId) as { n: number }
      expect(unlinked.n).toBe(0)
    }
  })
})
