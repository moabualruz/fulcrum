import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { _configureDb, closeDb, runMigrations, setDb } from 'fulcrum-agent-core'
import { TOOL_REGISTRY, type HandlerDeps } from '../tool-registry.js'
import { TOOL_SCHEMA_MAP } from '../mcp-tools.js'

describe('search_code roadmap CLI/action contract', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    _configureDb(db)
    runMigrations(db)
    setDb(db)
    db.prepare("INSERT OR IGNORE INTO workspaces(workspace_id, name) VALUES ('ws_cli_code', 'ws_cli_code')").run()
    db.prepare("INSERT OR IGNORE INTO projects(project_id, workspace_id, name) VALUES ('proj_cli_code', 'ws_cli_code', 'proj_cli_code')").run()
    db.prepare(`
      INSERT INTO code_chunks (
        chunk_id, workspace_id, project_id, file_path, language, chunk_strategy,
        source_type, content, content_hash, start_line, end_line, symbol_path, indexed_at
      ) VALUES (
        'chunk_cli_code', 'ws_cli_code', 'proj_cli_code',
        'packages/memory/src/retrieval/search-code.ts', 'typescript', 'syntax',
        'code', 'export function searchCodeRoadmapContract() { return true }',
        'hash-cli-code', 21, 27, 'retrieval.searchCodeRoadmapContract',
        '2026-04-23T10:00:00.000Z'
      )
    `).run()
  })

  afterEach(() => closeDb())

  function deps(): HandlerDeps {
    return {
      db,
      workspace_id: 'ws_cli_code',
      project_id: 'proj_cli_code',
      trusted_caller_role: 'software_engineer',
      trusted_caller_run_id: 'run_cli_code',
    }
  }

  it('keeps search_code schema registered and extends inputs without dropping compatibility', () => {
    const schema = TOOL_SCHEMA_MAP.get('search_code')
    expect(schema).toBeDefined()
    expect(schema?.annotations?.readOnlyHint).toBe(true)
    expect(schema?.inputSchema.properties).toMatchObject({
      text: expect.any(Object),
      path: expect.any(Object),
      symbol: expect.any(Object),
      package: expect.any(Object),
      module: expect.any(Object),
      dependency: expect.any(Object),
      changed_files: expect.any(Object),
      explain: expect.any(Object),
    })
  })

  it('returns enhanced explain fields while preserving legacy result keys', async () => {
    const result = await TOOL_REGISTRY.get('search_code')!.handler({
      text: 'searchCodeRoadmapContract',
      limit: 5,
      explain: true,
    }, deps()) as {
      results: Array<{
        chunk_id: string
        rel_path: string
        start_line: number
        line_start: number
        line_end: number
        symbol_path: string
        vector_status: string
        parse_status: string
        stage_scores: Record<string, number>
        stage_contributions: Array<{ stage: string; score: number }>
        freshness: string
      }>
      skipped_stages?: Array<{ stage: string; reason: string }>
    }

    expect(result.results[0]).toMatchObject({
      chunk_id: 'chunk_cli_code',
      rel_path: 'packages/memory/src/retrieval/search-code.ts',
      start_line: 21,
      line_start: 21,
      line_end: 27,
      symbol_path: 'retrieval.searchCodeRoadmapContract',
      vector_status: 'legacy',
      parse_status: 'parsed',
      freshness: 'current',
    })
    expect(result.results[0]).not.toHaveProperty('file_id')
    expect(result.results[0]).not.toHaveProperty('runtime_truth')
    expect(result.results[0]?.stage_scores['fts']).toBeGreaterThan(0)
    expect(result.results[0]?.stage_contributions.map(stage => stage.stage)).toContain('fts')
    expect(result.skipped_stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'code_vector' }),
    ]))
  })

  it('passes new roadmap ranking hints through the search_code handler', async () => {
    db.prepare(`
      INSERT INTO code_chunks (
        chunk_id, workspace_id, project_id, file_path, language, chunk_strategy,
        source_type, content, content_hash, start_line, end_line, symbol_path, indexed_at
      ) VALUES (
        'chunk_cli_hint', 'ws_cli_code', 'proj_cli_code',
        'packages/memory/src/l2/code.ts', 'typescript', 'syntax',
        'code', 'import Database from "better-sqlite3"\nexport function hintedSearchCode() { return true }',
        'hash-cli-hint', 30, 33, 'l2.hintedSearchCode',
        '2026-04-23T09:00:00.000Z'
      )
    `).run()

    const result = await TOOL_REGISTRY.get('search_code')!.handler({
      package: 'packages/memory',
      module: 'l2',
      dependency: 'better-sqlite3',
      changed_files: ['packages/memory/src/l2/code.ts'],
      limit: 5,
      explain: true,
    }, deps()) as {
      results: Array<{
        chunk_id: string
        stage_contributions: Array<{ stage: string; score: number }>
      }>
    }

    expect(result.results[0]?.chunk_id).toBe('chunk_cli_hint')
    expect(result.results[0]?.stage_contributions.map(stage => stage.stage)).toEqual(expect.arrayContaining([
      'package',
      'module',
      'dependency',
      'changed_file',
    ]))
  })
})
