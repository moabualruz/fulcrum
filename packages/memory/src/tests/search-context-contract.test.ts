import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { searchContext } from '../retrieval/search-context.js'

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  resetTestDb()
})

function seedContextCorpus(): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO memories (
      memory_id, workspace_id, project_id, kind, scope, content, content_hash,
      schema_version, title, summary, entities, provenance
    ) VALUES
      ('mem_ctx', 'ws_1', 'proj_1', 'fact', 'project', 'RAG repair vectors use targeted repair plans.', 'hash-mem-ctx', 3, 'RAG repair memory', 'targeted vectors', '[]', '{"sources":["src_raw_ctx"]}'),
      ('mem_decision_ctx', 'ws_1', 'proj_1', 'decision', 'project', 'Decision: RAG repair keeps clean-slate rebuilds disabled by default.', 'hash-decision-ctx', 3, 'RAG repair decision', 'no clean slate', '[]', '{"sources":["src_decision_ctx"]}')
  `).run()
  db.prepare(`
    INSERT INTO code_files (
      file_id, workspace_id, project_id, rel_path, language, sha256,
      mtime_ns, size_bytes, chunks_count, indexed_at
    ) VALUES ('file_ctx', 'ws_1', 'proj_1', 'src/rag.ts', 'typescript', 'sha-rag', 0, 100, 1, 0)
  `).run()
  db.prepare(`
    INSERT INTO code_chunks (
      chunk_id, workspace_id, project_id, file_path, file_id,
      chunk_strategy, source_type, content, content_hash, start_line, end_line, symbol_path
    ) VALUES (
      'chunk_ctx', 'ws_1', 'proj_1', 'src/rag.ts', 'file_ctx',
      'syntax', 'code', 'function repairVectors() { return "RAG repair code vectors"; }',
      'hash-chunk-ctx', 10, 12, 'repairVectors'
    )
  `).run()
  db.prepare(`
    INSERT INTO tasks(task_id, workspace_id, project_id, display_id, title, description, status)
    VALUES ('task_ctx', 'ws_1', 'proj_1', 'T-CTX', 'Wire RAG repair vector tracing', 'Search context should include task evidence.', 'queued')
  `).run()
  db.prepare(`
    INSERT INTO graph_entities(entity_id, workspace_id, name, entity_type, properties, created_at, updated_at)
    VALUES (
      'graph_ctx', 'ws_1', 'RAG repair graph node', 'memory',
      '{"graph_evidence":true,"project_id":"proj_1","kind":"entity","domain":"memory","relationship_type":"represents","source_refs":[],"confidence":1,"freshness":"current"}',
      datetime('now'), datetime('now')
    )
  `).run()
}

describe('searchContext contract', () => {
  it('returns typed source-diverse records with required source refs and trace id without persisting by default', async () => {
    seedContextCorpus()

    const response = await searchContext({
      query: 'RAG repair vectors',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      limit: 10,
      explain: true,
    })

    expect(response.query_trace_id).toMatch(/^ragtrace_/)
    expect(response.results.map(result => result.type)).toEqual(expect.arrayContaining([
      'memory',
      'decision',
      'code_chunk',
      'task',
      'graph_entity',
    ]))
    for (const result of response.results) {
      expect(result.rank).toBeGreaterThan(0)
      expect(result.score).toBeGreaterThan(0)
      expect(result.title.length).toBeGreaterThan(0)
      expect(result.snippet.length).toBeGreaterThan(0)
      expect(Object.keys(result.source_ref).length).toBeGreaterThan(0)
      expect(result.stage_contributions.length).toBeGreaterThan(0)
      expect(result.explanation_status).not.toBe('unavailable')
      expect(JSON.stringify(result.source_ref)).not.toContain('/home/')
    }
    const codeResult = response.results.find(result => result.type === 'code_chunk')
    expect(codeResult?.source_ref.file_path).toBe('src/rag.ts')
    expect(codeResult?.source_ref.symbol_path).toBe('repairVectors')
    const persisted = getDb().prepare('SELECT COUNT(*) AS n FROM rag_context_results WHERE query_trace_id = ?')
      .get(response.query_trace_id) as { n: number }
    const traces = getDb().prepare('SELECT COUNT(*) AS n FROM rag_query_traces WHERE query_trace_id = ?')
      .get(response.query_trace_id) as { n: number }
    expect(traces.n).toBe(0)
    expect(persisted.n).toBe(0)
  })

  it('persists redacted trace, result, and context pack evidence only when explicitly requested', async () => {
    const db = getDb()
    db.prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, title, summary, entities, provenance
      ) VALUES (
        'mem_abs_path', 'ws_1', 'proj_1', 'fact', 'project',
        'Operator note references /home/mkh/private/trace.log while debugging RAG repair.',
        'hash-abs-path', 3, 'Absolute path note', 'path redaction', '[]', '{}'
      )
    `).run()

    const response = await searchContext({
      query: 'operator trace debugging',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      limit: 5,
      context_budget_tokens: 200,
      persist: true,
    })

    expect(JSON.stringify(response.results)).not.toContain('/home/')
    expect(JSON.stringify(response.context_pack?.results)).not.toContain('/home/')
    const trace = db.prepare('SELECT COUNT(*) AS n FROM rag_query_traces WHERE query_trace_id = ?')
      .get(response.query_trace_id) as { n: number }
    const results = db.prepare('SELECT COUNT(*) AS n FROM rag_context_results WHERE query_trace_id = ?')
      .get(response.query_trace_id) as { n: number }
    const row = db.prepare('SELECT results FROM context_packs WHERE query_trace_id = ?')
      .get(response.query_trace_id) as { results: string }
    expect(trace.n).toBe(1)
    expect(results.n).toBe(response.results.length)
    expect(row.results).not.toContain('/home/')
    expect(row.results).toContain('[REDACTED_PATH:')
  })
})
