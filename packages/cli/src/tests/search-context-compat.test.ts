import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { _configureDb, closeDb, runMigrations, setDb } from 'fulcrum-agent-core'
import { runMigration101MemoryV3Lifecycle } from 'fulcrum-memory'
import { TOOL_REGISTRY, type HandlerDeps } from '../tool-registry.js'

let db: Database.Database

function deps(): HandlerDeps {
  return {
    db,
    workspace_id: 'ws_cli_compat',
    project_id: 'proj_cli_compat',
    trusted_caller_role: 'software_engineer',
    trusted_caller_run_id: 'run_cli_compat',
  }
}

beforeEach(() => {
  db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  runMigration101MemoryV3Lifecycle(db)
  setDb(db)
  db.prepare("INSERT OR IGNORE INTO workspaces(workspace_id, name) VALUES ('ws_cli_compat', 'ws_cli_compat')").run()
  db.prepare("INSERT OR IGNORE INTO projects(project_id, workspace_id, name) VALUES ('proj_cli_compat', 'ws_cli_compat', 'proj_cli_compat')").run()
})

afterEach(() => {
  closeDb()
})

describe('search context backward compatibility', () => {
  it('keeps recall_knowledge action callable after search_context wiring', async () => {
    const result = await TOOL_REGISTRY.get('recall_knowledge')!.handler({
      query: 'nothing indexed for recall compatibility',
    }, deps()) as { results: unknown[]; reason?: string }

    expect(result.results).toEqual([])
    expect(result.reason).toBe('no_match')
  })

  it('keeps search_code action returning code chunks', async () => {
    db.prepare(`
      INSERT INTO code_chunks (
        chunk_id, workspace_id, project_id, file_path, file_id,
        chunk_strategy, source_type, content, content_hash, start_line, end_line, symbol_path
      ) VALUES (
        'chunk_cli_compat', 'ws_cli_compat', 'proj_cli_compat', 'src/compat.ts', NULL,
        'syntax', 'code', 'export function compatSearchCode() { return true }',
        'hash-cli-compat', 1, 3, 'compatSearchCode'
      )
    `).run()

    const result = await TOOL_REGISTRY.get('search_code')!.handler({
      path: 'compat.ts',
      limit: 5,
    }, deps()) as { results: Array<{ chunk_id: string; rel_path: string }> }

    expect(result.results.map(row => row.chunk_id)).toContain('chunk_cli_compat')
    expect(result.results[0]?.rel_path).toBe('src/compat.ts')
  })
})
