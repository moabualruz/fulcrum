import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { ingestProject } from '../ingest.js'
import { syncFile } from '../pci/syncer.js'
import { computeFileId } from '../l2/code.js'

describe('code index roadmap parity — batch and PCI', () => {
  let db: ReturnType<typeof createTestDb>
  let root: string

  beforeEach(() => {
    db = createTestDb()
    root = join(tmpdir(), `fulcrum-code-roadmap-parity-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(root, 'packages/memory/src/retrieval'), { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    resetTestDb()
  })

  function rows(projectId: string): Array<Record<string, unknown>> {
    return db.prepare(`
      SELECT f.rel_path, f.file_id, f.status, f.parse_status, f.vector_status,
             f.chunks_count, c.chunk_id, c.start_line, c.end_line,
             c.symbol_path, c.parse_status AS chunk_parse_status,
             c.vector_status AS chunk_vector_status
        FROM code_files f
        JOIN code_chunks c ON c.file_id = f.file_id
       WHERE f.project_id = ?
       ORDER BY f.rel_path, c.start_line, c.end_line
    `).all(projectId) as Array<Record<string, unknown>>
  }

  it('keeps file identity, line attribution, failure state, and freshness equivalent across batch and PCI indexing', async () => {
    const workspaceId = 'ws_code_parity'
    const batchProjectId = 'proj_code_batch'
    const pciProjectId = 'proj_code_pci'
    seedWorkspaceAndProject(db, workspaceId, batchProjectId)
    seedWorkspaceAndProject(db, workspaceId, pciProjectId)

    const relPath = 'packages/memory/src/retrieval/search-code.ts'
    const body = [
      'const header = true',
      '',
      'export function roadmapParityTarget() {',
      '  return "same evidence"',
      '}',
      '',
    ].join('\n')
    writeFileSync(join(root, relPath), body, 'utf8')

    await ingestProject({ workspace_id: workspaceId, project_id: batchProjectId, root_path: root })
    await syncFile({
      db,
      workspaceId,
      projectId: pciProjectId,
      projectRoot: root,
      event: { change_type: 'add', path: join(root, relPath) },
    })

    const batchRows = rows(batchProjectId)
    const pciRows = rows(pciProjectId)

    expect(batchRows).toHaveLength(pciRows.length)
    expect(batchRows[0]).toMatchObject({
      rel_path: relPath,
      file_id: computeFileId(batchProjectId, relPath),
      status: 'indexed',
      parse_status: 'parsed',
      vector_status: 'pending',
      chunk_parse_status: 'parsed',
      chunk_vector_status: 'pending',
    })
    expect(pciRows[0]).toMatchObject({
      rel_path: relPath,
      file_id: computeFileId(pciProjectId, relPath),
      status: 'indexed',
      parse_status: 'parsed',
      vector_status: 'pending',
      chunk_parse_status: 'parsed',
      chunk_vector_status: 'pending',
    })
    expect(batchRows.map(row => [row['start_line'], row['end_line'], row['symbol_path']]))
      .toEqual(pciRows.map(row => [row['start_line'], row['end_line'], row['symbol_path']]))
  })
})
