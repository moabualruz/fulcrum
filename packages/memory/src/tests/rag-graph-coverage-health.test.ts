import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { buildRagHealthReport } from '../setup/rag-health.js'

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  resetTestDb()
})

describe('RAG graph coverage health', () => {
  it('aggregates memory, task, decision, file, symbol, error, and fix coverage domains', () => {
    getDb().prepare(`
      INSERT INTO tasks(task_id, workspace_id, project_id, display_id, title, status)
      VALUES ('task_graph', 'ws_1', 'proj_1', 'T-GRAPH', 'Graph task', 'queued')
    `).run()
    getDb().prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, vault_path, title, summary, entities, provenance
      ) VALUES
        ('mem_fact_graph', 'ws_1', 'proj_1', 'fact', 'project', 'fact body', 'hash-fact', 3, 'curated/pages/mem_fact_graph.md', 'fact', 'fact', '[]', '{}'),
        ('mem_decision_graph', 'ws_1', 'proj_1', 'decision', 'project', 'decision body', 'hash-decision', 3, 'curated/pages/mem_decision_graph.md', 'decision', 'decision', '[]', '{}'),
        ('mem_error_graph', 'ws_1', 'proj_1', 'error', 'project', 'error body', 'hash-error', 3, 'curated/pages/mem_error_graph.md', 'error', 'error', '[]', '{}'),
        ('mem_fix_graph', 'ws_1', 'proj_1', 'task_outcome', 'project', 'fix body', 'hash-fix', 3, 'curated/pages/mem_fix_graph.md', 'fix', 'fix', '[]', '{}')
    `).run()
    getDb().prepare(`
      INSERT INTO code_files (
        file_id, workspace_id, project_id, rel_path, language, sha256,
        mtime_ns, size_bytes, chunks_count, indexed_at
      ) VALUES ('file_graph', 'ws_1', 'proj_1', 'src/graph.ts', 'typescript', 'sha-graph', 0, 10, 0, 0)
    `).run()
    getDb().prepare(`
      INSERT INTO code_symbols(file_id, name, kind, line)
      VALUES ('file_graph', 'GraphSymbol', 'function', 12)
    `).run()

    const report = buildRagHealthReport({ workspace_id: 'ws_1', project_id: 'proj_1' })
    const graph = report.domains['graph'] as Record<string, unknown>

    expect(graph.status).toBe('degraded')
    expect(graph.domain_coverage).toMatchObject({
      memory: { sources: 4, graph_entities: 0, status: 'degraded' },
      task: { sources: 1, graph_entities: 0, status: 'degraded' },
      decision: { sources: 1, graph_entities: 0, status: 'degraded' },
      file: { sources: 1, graph_entities: 0, status: 'degraded' },
      symbol: { sources: 1, graph_entities: 0, status: 'degraded' },
      error: { sources: 1, graph_entities: 0, status: 'degraded' },
      fix: { sources: 1, graph_entities: 0, status: 'degraded' },
    })
    expect(graph.coverage_gaps).toEqual(expect.arrayContaining(['memory', 'task', 'decision', 'file', 'symbol', 'error', 'fix']))
  })

  it('does not let another project graph evidence skew this project health counts', () => {
    const db = getDb()
    db.prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_2', 'ws_1', 'proj_2')").run()
    db.prepare(`
      INSERT INTO graph_entities (
        entity_id, workspace_id, name, entity_type, properties, created_at, updated_at
      ) VALUES
        ('ent_other_project_source', 'ws_1', 'Other project source', 'task',
         '{"graph_evidence":true,"project_id":"proj_2","kind":"entity","domain":"task","relationship_type":"represents","source_refs":[]}',
         '2026-04-23T10:00:00.000Z', '2026-04-23T10:00:00.000Z'),
        ('ent_other_project_target', 'ws_1', 'Other project target', 'file',
         '{"graph_evidence":true,"project_id":"proj_2","kind":"entity","domain":"file","relationship_type":"represents","source_refs":[]}',
         '2026-04-23T10:00:00.000Z', '2026-04-23T10:00:00.000Z')
    `).run()
    db.prepare(`
      INSERT INTO graph_edges (
        edge_id, workspace_id, source_id, target_id, relation, weight, properties, created_at
      ) VALUES (
        'edge_other_project', 'ws_1', 'ent_other_project_source', 'ent_other_project_target', 'touches_file',
        1.0, '{"graph_evidence":true,"project_id":"proj_2","kind":"edge","domain":"task","relationship_type":"touches_file","source_refs":[]}',
        '2026-04-23T10:00:00.000Z'
      )
    `).run()

    const report = buildRagHealthReport({ workspace_id: 'ws_1', project_id: 'proj_1' })
    const graph = report.domains['graph'] as Record<string, unknown>

    expect(graph.status).toBe('healthy')
    expect(graph.broken_edges).toBe(0)
    expect(graph.edges).toBe(0)
    expect(graph.entities).toBe(0)
  })
})
