import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { runRagRebuild } from '../setup/rag-lifecycle.js'

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  resetTestDb()
})

function seedCodeFile(fileId = 'file_ok', chunksCount = 0): void {
  getDb().prepare(`
    INSERT INTO code_files (
      file_id, workspace_id, project_id, rel_path, language, sha256,
      mtime_ns, size_bytes, chunks_count, indexed_at
    ) VALUES (?, 'ws_1', 'proj_1', 'src/a.ts', 'typescript', 'hash', 0, 0, ?, 0)
  `).run(fileId, chunksCount)
}

function seedCodeChunk(chunkId: string, fileId: string): void {
  getDb().prepare(`
    INSERT INTO code_chunks (
      chunk_id, workspace_id, project_id, file_path, file_id, language,
      chunk_strategy, source_type, content, start_line, end_line, content_hash
    ) VALUES (?, 'ws_1', 'proj_1', 'src/a.ts', ?, 'typescript', 'syntax', 'code', 'export const a = 1', 1, 1, 'chunkhash')
  `).run(chunkId, fileId)
}

describe('RAG rebuild staged candidates', () => {
  it('promotes a verified candidate and persists a machine-readable report', async () => {
    seedCodeFile()

    const result = await runRagRebuild({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      mode: 'execute',
      domains: ['code'],
    })

    expect(result.status).toBe('completed')
    expect(result.candidate?.disposition).toBe('promoted')

    const report = getDb().prepare('SELECT status, candidate_disposition FROM rag_rebuild_reports WHERE report_id = ?').get(result.report_id) as { status: string; candidate_disposition: string }
    expect(report).toEqual({ status: 'completed', candidate_disposition: 'promoted' })
  })

  it('quarantines a failed candidate and keeps served state unchanged', async () => {
    seedCodeFile('file_ok', 1)
    seedCodeChunk('chunk_orphan', 'missing_file')

    const result = await runRagRebuild({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      mode: 'execute',
      domains: ['code'],
    })

    expect(result.status).toBe('failed')
    expect(result.candidate?.disposition).toBe('quarantined')
    expect(result.candidate?.served_state_unchanged).toBe(true)
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'parity_failed', check: 'code_chunks_file_id' }))
  })
})

