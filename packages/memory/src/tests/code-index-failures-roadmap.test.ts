import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { indexCodeFile, markCodeFileSkipped } from '../l2/code.js'
import { buildRagHealthReport } from '../setup/rag-health.js'
import { searchCode } from '../retrieval/search-code.js'

describe('code index failure state roadmap exposure', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
    seedWorkspaceAndProject(db, 'ws_code_fail', 'proj_code_fail')
  })

  afterEach(() => resetTestDb())

  it('exposes parse/index failures through health details', async () => {
    await indexCodeFile({
      workspace_id: 'ws_code_fail',
      project_id: 'proj_code_fail',
      rel_path: 'src/broken-parser.ts',
      content: 'export function brokenParser() { return true }\n',
      language: 'typescript',
      chunker: () => {
        throw new Error('tree-sitter parse failed at /home/mkh/private/source.ts token=supersecret')
      },
    }, db)
    markCodeFileSkipped({
      workspace_id: 'ws_code_fail',
      project_id: 'proj_code_fail',
      rel_path: 'src/generated.pb.ts',
      language: 'typescript',
      reason: 'generated_file_skipped',
    }, db)

    const report = buildRagHealthReport({ workspace_id: 'ws_code_fail', project_id: 'proj_code_fail' }, db)
    const code = report.domains['code'] as Record<string, unknown>

    expect(code['status']).toBe('degraded')
    expect(code['parse_failed_files']).toBe(1)
    expect(code['parse_skipped_files']).toBe(1)
    expect(code['failure_samples']).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rel_path: 'src/broken-parser.ts',
        parse_status: 'failed',
        failure_reason: expect.stringContaining('tree-sitter parse failed'),
      }),
      expect.objectContaining({
        rel_path: 'src/generated.pb.ts',
        parse_status: 'skipped',
        failure_reason: 'generated_file_skipped',
      }),
    ]))
    expect(JSON.stringify(code['failure_samples'])).not.toContain('/home/')
    expect(JSON.stringify(code['failure_samples'])).not.toContain('supersecret')
  })

  it('surfaces matching failed file state in search explanations without leaking absolute paths', async () => {
    await indexCodeFile({
      workspace_id: 'ws_code_fail',
      project_id: 'proj_code_fail',
      rel_path: 'src/search-broken.ts',
      content: 'export function searchBrokenRoadmap() { return true }\n',
      language: 'typescript',
      chunker: () => {
        throw new Error('parse failed at line 1')
      },
    }, db)

    const out = await searchCode({
      workspace_id: 'ws_code_fail',
      project_id: 'proj_code_fail',
      path: 'search-broken.ts',
      explain: true,
    }, db)

    expect(out.results).toEqual([])
    expect(out.skipped_stages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        stage: 'code_index',
        reason: expect.stringContaining('src/search-broken.ts'),
      }),
    ]))
    expect(JSON.stringify(out)).not.toContain('/home/')
  })

  it('redacts legacy stored failure reasons again at search exposure boundaries', async () => {
    db.prepare(`
      INSERT INTO code_files (
        file_id, workspace_id, project_id, rel_path, language, sha256,
        mtime_ns, size_bytes, chunks_count, indexed_at, status, parse_status,
        failure_reason, last_error_at
      ) VALUES (
        'file_legacy_failure', 'ws_code_fail', 'proj_code_fail', 'src/legacy-failure.ts',
        'typescript', 'sha-legacy-failure', 0, 10, 0, 0, 'failed', 'failed',
        'failed at /home/mkh/private/file.ts token=supersecret', datetime('now')
      )
    `).run()

    const out = await searchCode({
      workspace_id: 'ws_code_fail',
      project_id: 'proj_code_fail',
      path: 'legacy-failure.ts',
      explain: true,
    }, db)

    expect(JSON.stringify(out.skipped_stages)).not.toContain('/home/')
    expect(JSON.stringify(out.skipped_stages)).not.toContain('supersecret')
    expect(JSON.stringify(out.skipped_stages)).toContain('[REDACTED_PATH:')
  })
})
