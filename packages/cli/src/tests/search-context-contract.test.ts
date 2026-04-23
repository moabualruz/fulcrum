import { afterEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { _configureDb, closeDb, runMigrations, setDb } from 'fulcrum-agent-core'
import { persistGraphEvidenceUnit } from 'fulcrum-memory'
import { TOOL_SCHEMA_MAP } from '../mcp-tools.js'
import { TOOL_REGISTRY, type HandlerDeps } from '../tool-registry.js'

const originalArgv = process.argv

function installDb(): Database.Database {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  db.prepare("INSERT OR IGNORE INTO workspaces(workspace_id, name) VALUES ('ws_cli_ctx', 'ws_cli_ctx')").run()
  db.prepare("INSERT OR IGNORE INTO projects(project_id, workspace_id, name) VALUES ('proj_cli_ctx', 'ws_cli_ctx', 'proj_cli_ctx')").run()
  return db
}

function seedUnifiedContext(db: Database.Database): void {
  db.prepare(`
    INSERT INTO memories (
      memory_id, workspace_id, project_id, kind, scope, content, content_hash,
      schema_version, title, summary, entities, provenance
    ) VALUES (
      'mem_cli_ctx', 'ws_cli_ctx', 'proj_cli_ctx', 'fact', 'project',
      'CLI unified search returns context evidence.', 'hash-cli-ctx',
      3, 'CLI context memory', 'search context', '[]', '{"sources":["src_cli_ctx"]}'
    )
  `).run()
}

function deps(db: Database.Database): HandlerDeps {
  return {
    db,
    workspace_id: 'ws_cli_ctx',
    project_id: 'proj_cli_ctx',
    trusted_caller_role: 'software_engineer',
    trusted_caller_run_id: 'run_cli_ctx',
  }
}

afterEach(() => {
  process.argv = originalArgv
  closeDb()
  vi.restoreAllMocks()
})

describe('search context CLI/action contract', () => {
  it('marks search_context as read-default in schema and registry metadata', () => {
    const schema = TOOL_SCHEMA_MAP.get('search_context')
    const entry = TOOL_REGISTRY.get('search_context')

    expect(schema?.annotations?.readOnlyHint).toBe(true)
    expect(schema?.description).toContain('Read-only by default')
    expect(entry?.capabilities.readOnly).toBe(true)
  })

  it('runs search_context registry handler with read-only default deps and explain output', async () => {
    const db = installDb()
    seedUnifiedContext(db)

    const result = await TOOL_REGISTRY.get('search_context')!.handler({
      query: 'unified search context',
      explain: true,
      context_budget_tokens: 40,
    }, deps(db)) as {
      query_trace_id: string
      results: Array<{ source_ref: { source_id?: string }; explanation_status: string }>
      context_pack?: { query_trace_id: string }
    }

    expect(result.query_trace_id).toMatch(/^ragtrace_/)
    expect(result.results[0]?.source_ref.source_id).toBe('mem_cli_ctx')
    expect(result.results[0]?.explanation_status).toBe('partial')
    expect(result.context_pack?.query_trace_id).toBe(result.query_trace_id)
    const traces = db.prepare('SELECT COUNT(*) AS n FROM rag_query_traces WHERE query_trace_id = ?')
      .get(result.query_trace_id) as { n: number }
    expect(traces.n).toBe(0)
  })

  it('persists query trace rows only when the registry handler requests it explicitly', async () => {
    const db = installDb()
    seedUnifiedContext(db)

    const result = await TOOL_REGISTRY.get('search_context')!.handler({
      query: 'unified search context',
      explain: true,
      persist: true,
    }, deps(db)) as {
      query_trace_id: string
      results: Array<{ source_ref: { source_id?: string } }>
    }

    expect(result.results[0]?.source_ref.source_id).toBe('mem_cli_ctx')
    const traces = db.prepare('SELECT COUNT(*) AS n FROM rag_query_traces WHERE query_trace_id = ?')
      .get(result.query_trace_id) as { n: number }
    expect(traces.n).toBe(1)
  })

  it('forwards graph mode controls through the registry handler', async () => {
    const db = installDb()
    const summary = persistGraphEvidenceUnit({
      workspace_id: 'ws_cli_ctx',
      project_id: 'proj_cli_ctx',
      kind: 'summary',
      domain: 'memory',
      relationship_type: 'summarizes',
      name: 'CLI global graph summary',
      summary_id: 'summary_cli_global',
      summary: 'Global CLI summary for graph mode routing.',
      source_refs: [],
      confidence: 0.9,
      freshness: 'current',
    })

    const result = await TOOL_REGISTRY.get('search_context')!.handler({
      query: 'global graph mode routing',
      include_graph: true,
      graph_mode: 'global_summary',
      graph_depth: 1,
      explain: true,
    }, deps(db)) as {
      results: Array<{ source_ref: { graph_id?: string } }>
      graph_contributions: Array<{ mode: string }>
    }

    expect(result.graph_contributions[0]?.mode).toBe('global_summary')
    expect(result.results.some(row => row.source_ref.graph_id === summary.graph_unit_id)).toBe(true)
  })

  it('prints JSON for fulcrum search context "<query>" --explain --json', async () => {
    const db = installDb()
    seedUnifiedContext(db)
    process.argv = [
      'node',
      'cli',
      'search',
      'context',
      'unified search context',
      '--workspace-id',
      'ws_cli_ctx',
      '--project-id',
      'proj_cli_ctx',
      '--explain',
      '--json',
    ]

    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      lines.push(String(line))
    })
    const { runSearch } = await import('../index.js')
    await runSearch()

    const output = JSON.parse(lines.join('\n')) as {
      query_trace_id: string
      results: Array<{ source_ref: { source_id?: string } }>
      skipped_stages: Array<{ stage: string }>
    }
    expect(output.query_trace_id).toMatch(/^ragtrace_/)
    expect(output.results[0]?.source_ref.source_id).toBe('mem_cli_ctx')
    expect(output.skipped_stages.map(stage => stage.stage)).toContain('semantic')
    const traces = db.prepare('SELECT COUNT(*) AS n FROM rag_query_traces WHERE query_trace_id = ?')
      .get(output.query_trace_id) as { n: number }
    expect(traces.n).toBe(0)
  })
})
