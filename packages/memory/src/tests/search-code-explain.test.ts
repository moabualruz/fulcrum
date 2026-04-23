import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { indexCodeFile } from '../l2/code.js'
import { searchCode } from '../retrieval/search-code.js'

describe('searchCode explain output', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
    seedWorkspaceAndProject(db, 'ws_code_explain', 'proj_code_explain')
  })

  afterEach(() => resetTestDb())

  it('returns code-backed explanation with path and line range attribution', async () => {
    await indexCodeFile({
      workspace_id: 'ws_code_explain',
      project_id: 'proj_code_explain',
      rel_path: 'src/explain-target.ts',
      content: [
        'export function setup() {',
        '  return true',
        '}',
        '',
        'export function explainCodeTarget() {',
        '  return "code explain needle"',
        '}',
      ].join('\n'),
      language: 'typescript',
    }, db)

    const out = await searchCode({
      workspace_id: 'ws_code_explain',
      project_id: 'proj_code_explain',
      text: 'code explain needle',
      explain: true,
    }, db)

    expect(out.results).toHaveLength(1)
    const hit = out.results[0]!
    expect(hit.rel_path).toBe('src/explain-target.ts')
    expect(hit.start_line).toBeGreaterThanOrEqual(1)
    expect(hit.end_line).toBeGreaterThanOrEqual(hit.start_line)
    expect(hit.explanation).toBeDefined()
    expect(hit.explanation!.result_id).toBe(hit.chunk_id)
    expect(hit.explanation!.result_type).toBe('code_chunk')
    expect(hit.explanation!.trust.provenance_class).toBe('code-backed')
    expect(hit.explanation!.stage_ranks.fts).toBe(1)
    expect(hit.explanation!.stage_scores.fused).toBe(hit.score)
    expect(hit.explanation!.sources[0]).toMatchObject({
      kind: 'code',
      source_id: hit.chunk_id,
      path: 'src/explain-target.ts',
      start_line: hit.start_line,
      end_line: hit.end_line,
    })
  })

  it('ranks FTS explanation inside the requested project scope', async () => {
    seedWorkspaceAndProject(db, 'ws_code_explain', 'proj_other')
    await indexCodeFile({
      workspace_id: 'ws_code_explain',
      project_id: 'proj_other',
      rel_path: 'src/other.ts',
      content: 'export const otherProjectNeedle = "scoped explain needle scoped explain needle"',
      language: 'typescript',
    }, db)
    await indexCodeFile({
      workspace_id: 'ws_code_explain',
      project_id: 'proj_code_explain',
      rel_path: 'src/current.ts',
      content: 'export const currentProjectNeedle = "scoped explain needle"',
      language: 'typescript',
    }, db)

    const out = await searchCode({
      workspace_id: 'ws_code_explain',
      project_id: 'proj_code_explain',
      text: 'scoped explain needle',
      explain: true,
    }, db)

    expect(out.results).toHaveLength(1)
    expect(out.results[0]!.rel_path).toBe('src/current.ts')
    expect(out.results[0]!.explanation!.stage_ranks.fts).toBe(1)
  })
})
