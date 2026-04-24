import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { defaultRetriever } from '../eval/roadmap/support.js'
import type { RoadmapRagEvalCase, RunRoadmapRagEvalSuiteInput } from '../eval/index.js'

let db: ReturnType<typeof createTestDb>

beforeEach(() => {
  db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  resetTestDb()
})

describe('roadmap eval default retriever', () => {
  it('does not mark results grounded unless retrieved provenance matches expected sources', async () => {
    db.prepare(`
      INSERT INTO code_files (
        file_id, workspace_id, project_id, rel_path, language, sha256,
        mtime_ns, size_bytes, chunks_count, indexed_at
      ) VALUES ('file_eval_actual', 'ws_1', 'proj_1', 'src/actual.ts', 'typescript', 'sha-eval', 0, 100, 1, 0)
    `).run()
    db.prepare(`
      INSERT INTO code_chunks (
        chunk_id, workspace_id, project_id, file_path, file_id,
        chunk_strategy, source_type, content, content_hash, start_line, end_line, symbol_path
      ) VALUES (
        'chunk_eval_actual', 'ws_1', 'proj_1', 'src/actual.ts', 'file_eval_actual',
        'syntax', 'code', 'export function targetedRepairEvalProbe() { return "targeted repair eval"; }',
        'hash-eval-actual', 1, 1, 'targetedRepairEvalProbe'
      )
    `).run()

    const testCase: RoadmapRagEvalCase = {
      suite: 'code-rag',
      query: 'targeted repair eval',
      required_domains: ['code'],
      expected_sources: ['code:src/expected.ts'],
    }
    const input: RunRoadmapRagEvalSuiteInput = {
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      suite: 'code-rag',
    }

    const observation = await defaultRetriever(testCase, input, db)

    expect(observation.retrieved_sources).toContain('code:src/actual.ts')
    expect(observation.cited_sources).toEqual([])
    expect(observation.grounded).toBe(false)
  })

  it('does not mark a cited source grounded when expected claims lack support', async () => {
    db.prepare(`
      INSERT INTO code_files (
        file_id, workspace_id, project_id, rel_path, language, sha256,
        mtime_ns, size_bytes, chunks_count, indexed_at
      ) VALUES ('file_eval_claim', 'ws_1', 'proj_1', 'src/claim.ts', 'typescript', 'sha-claim', 0, 100, 1, 0)
    `).run()
    db.prepare(`
      INSERT INTO code_chunks (
        chunk_id, workspace_id, project_id, file_path, file_id,
        chunk_strategy, source_type, content, content_hash, start_line, end_line, symbol_path
      ) VALUES (
        'chunk_eval_claim', 'ws_1', 'proj_1', 'src/claim.ts', 'file_eval_claim',
        'syntax', 'code', 'export function claimProbe() { return "supported alpha"; }',
        'hash-eval-claim', 1, 1, 'claimProbe'
      )
    `).run()

    const testCase: RoadmapRagEvalCase = {
      suite: 'code-rag',
      query: 'supported alpha',
      required_domains: ['code'],
      expected_sources: ['code:src/claim.ts'],
      expected_claims: ['the implementation returns unsupported beta'],
    }
    const input: RunRoadmapRagEvalSuiteInput = {
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      suite: 'code-rag',
    }

    const observation = await defaultRetriever(testCase, input, db)

    expect(observation.cited_sources).toEqual(['code:src/claim.ts'])
    expect(observation.grounded).toBe(false)
  })
})
