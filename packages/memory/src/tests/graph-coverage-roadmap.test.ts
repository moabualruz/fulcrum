import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { rebuildGraphCoverage, summarizeGraphCoverage } from '../graph/coverage.js'
import { persistGraphEvidenceUnit, readGraphEvidenceUnits } from '../graph/evidence.js'

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  resetTestDb()
})

function seedGraphCoverageSources(): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO tasks(task_id, workspace_id, project_id, display_id, title, description, status)
    VALUES ('task_graph_coverage', 'ws_1', 'proj_1', 'T-GRAPH', 'Rebuild graph coverage', 'Task source for graph evidence.', 'queued')
  `).run()
  db.prepare(`
    INSERT INTO memories (
      memory_id, workspace_id, project_id, kind, scope, content, content_hash,
      schema_version, title, summary, entities, provenance
    ) VALUES
      ('mem_graph_fact', 'ws_1', 'proj_1', 'fact', 'project', 'Memory entity names GraphRepair.', 'hash-fact-graph', 3, 'Graph repair fact', 'fact', '["GraphRepair"]', '{}'),
      ('mem_graph_decision', 'ws_1', 'proj_1', 'decision', 'project', 'Decision links graph rebuild to search.', 'hash-decision-graph', 3, 'Graph rebuild decision', 'decision', '["GraphRepair"]', '{}'),
      ('mem_graph_error', 'ws_1', 'proj_1', 'error', 'project', 'Error: graph edge went stale.', 'hash-error-graph', 3, 'Graph stale error', 'error', '["GraphRepair"]', '{}'),
      ('mem_graph_fix', 'ws_1', 'proj_1', 'task_outcome', 'project', 'Fix: graph evidence refresh succeeded.', 'hash-fix-graph', 3, 'Graph refresh fix', 'fix', '["GraphRepair"]', '{}')
  `).run()
  db.prepare(`
    INSERT INTO code_files (
      file_id, workspace_id, project_id, rel_path, language, sha256,
      mtime_ns, size_bytes, chunks_count, indexed_at
    ) VALUES ('file_graph_coverage', 'ws_1', 'proj_1', 'src/graph-coverage.ts', 'typescript', 'sha-file-graph', 0, 200, 1, 0)
  `).run()
  db.prepare(`
    INSERT INTO code_symbols(file_id, name, kind, line)
    VALUES ('file_graph_coverage', 'rebuildGraphCoverage', 'function', 8)
  `).run()
  db.prepare(`
    INSERT INTO code_chunks (
      chunk_id, workspace_id, project_id, file_path, file_id,
      chunk_strategy, source_type, content, content_hash, start_line, end_line, symbol_path
    ) VALUES (
      'chunk_graph_coverage', 'ws_1', 'proj_1', 'src/graph-coverage.ts', 'file_graph_coverage',
      'syntax', 'code',
      'import { persistGraphEvidenceUnit } from "./evidence.js"; export function rebuildGraphCoverage() { return persistGraphEvidenceUnit(); }',
      'hash-chunk-graph', 1, 3, 'rebuildGraphCoverage'
    )
  `).run()
}

describe('graph roadmap coverage producer', () => {
  it('rebuilds graph coverage for memory, task, decision, error, fix, file, symbol, import, and call domains', () => {
    seedGraphCoverageSources()

    const coverage = rebuildGraphCoverage({ workspace_id: 'ws_1', project_id: 'proj_1' })

    expect(Object.keys(coverage.domains).sort()).toEqual([
      'call',
      'decision',
      'error',
      'file',
      'fix',
      'import',
      'memory',
      'symbol',
      'task',
    ])
    expect(coverage.domains.memory.sources).toBeGreaterThanOrEqual(4)
    expect(coverage.domains.task).toMatchObject({ sources: 1, current: 1, status: 'current' })
    expect(coverage.domains.decision).toMatchObject({ sources: 1, current: 1, status: 'current' })
    expect(coverage.domains.error).toMatchObject({ sources: 1, current: 1, status: 'current' })
    expect(coverage.domains.fix).toMatchObject({ sources: 1, current: 1, status: 'current' })
    expect(coverage.domains.file).toMatchObject({ sources: 1, current: 1, status: 'current' })
    expect(coverage.domains.symbol).toMatchObject({ sources: 1, current: 1, status: 'current' })
    expect(coverage.domains.import).toMatchObject({ sources: 1, current: 1, status: 'current' })
    expect(coverage.domains.call).toMatchObject({ sources: 1, current: 1, status: 'current' })

    const entityTypes = getDb().prepare(`
      SELECT entity_type, COUNT(*) AS n
        FROM graph_entities
       WHERE workspace_id = 'ws_1'
       GROUP BY entity_type
    `).all() as Array<{ entity_type: string; n: number }>
    expect(entityTypes.map(row => row.entity_type)).toEqual(expect.arrayContaining([
      'memory',
      'task',
      'decision',
      'error',
      'fix',
      'file',
      'symbol',
      'import',
      'call',
    ]))

    const edgeRelations = getDb().prepare(`
      SELECT DISTINCT relation
        FROM graph_edges
       WHERE workspace_id = 'ws_1'
    `).all() as Array<{ relation: string }>
    expect(edgeRelations.map(row => row.relation)).toEqual(expect.arrayContaining([
      'mentions_entity',
      'declares_symbol',
      'imports',
      'calls',
    ]))

    const records = getDb().prepare(`
      SELECT source_domain, derived_domain, status, COUNT(*) AS n
        FROM rag_coverage_records
       WHERE workspace_id = 'ws_1' AND project_id = 'proj_1'
       GROUP BY source_domain, derived_domain, status
    `).all() as Array<{ source_domain: string; derived_domain: string; status: string; n: number }>
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ source_domain: 'memory', derived_domain: 'graph', status: 'current' }),
      expect.objectContaining({ source_domain: 'task', derived_domain: 'graph', status: 'current' }),
      expect.objectContaining({ source_domain: 'decision', derived_domain: 'graph', status: 'current' }),
      expect.objectContaining({ source_domain: 'file_chunk', derived_domain: 'graph', status: 'current' }),
      expect.objectContaining({ source_domain: 'code_chunk', derived_domain: 'graph', status: 'current' }),
    ]))
  })

  it('does not count a different source as covered when both source hashes are absent', () => {
    const db = getDb()
    db.prepare(`
      INSERT INTO tasks(task_id, workspace_id, project_id, display_id, title, description, status)
      VALUES
        ('task_graph_one', 'ws_1', 'proj_1', 'T-GRAPH-1', 'Graph source one', 'Covered task.', 'queued'),
        ('task_graph_two', 'ws_1', 'proj_1', 'T-GRAPH-2', 'Graph source two', 'Uncovered task.', 'queued')
    `).run()

    persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'entity',
      domain: 'task',
      relationship_type: 'represents',
      name: 'Graph source one',
      source_refs: [{ source_domain: 'task', source_id: 'task_graph_one', project_id: 'proj_1' }],
      confidence: 0.8,
      freshness: 'current',
    })

    const coverage = summarizeGraphCoverage({ workspace_id: 'ws_1', project_id: 'proj_1' })
    expect(coverage.domains.task).toMatchObject({ sources: 2, current: 1, failed: 1, status: 'failed' })
  })

  it('uses task updated_at as the graph freshness token', () => {
    const db = getDb()
    db.prepare(`
      INSERT INTO tasks(task_id, workspace_id, project_id, display_id, title, description, status, updated_at)
      VALUES ('task_graph_stale', 'ws_1', 'proj_1', 'T-STALE', 'Graph stale task', 'Before.', 'queued', '2026-04-23T10:00:00.000Z')
    `).run()

    const before = rebuildGraphCoverage({ workspace_id: 'ws_1', project_id: 'proj_1' })
    expect(before.domains.task).toMatchObject({ sources: 1, current: 1, status: 'current' })

    db.prepare(`
      UPDATE tasks
         SET description = 'After.',
             updated_at = '2026-04-23T10:05:00.000Z'
       WHERE task_id = 'task_graph_stale'
    `).run()

    const after = summarizeGraphCoverage({ workspace_id: 'ws_1', project_id: 'proj_1' })
    expect(after.domains.task).toMatchObject({ sources: 1, stale: 1, status: 'stale' })
  })

  it('updates renamed graph sources by stable source identity during rebuild', () => {
    const db = getDb()
    db.prepare(`
      INSERT INTO tasks(task_id, workspace_id, project_id, display_id, title, description, status, updated_at)
      VALUES ('task_graph_rename', 'ws_1', 'proj_1', 'T-RENAME', 'Old graph task title', 'Before.', 'queued', '2026-04-23T10:00:00.000Z')
    `).run()
    const before = rebuildGraphCoverage({ workspace_id: 'ws_1', project_id: 'proj_1' })
    expect(before.domains.task).toMatchObject({ sources: 1, current: 1, stale: 0, status: 'current' })
    const beforeTaskUnit = before.evidence_units.find(unit => (
      unit.kind === 'entity'
      && unit.domain === 'task'
      && unit.relationship_type === 'represents'
      && unit.source_refs.some(ref => ref.source_id === 'task_graph_rename')
    ))
    expect(beforeTaskUnit?.graph_unit_id).toMatch(/^ent_/)

    db.prepare(`
      UPDATE tasks
         SET title = 'New graph task title',
             description = 'After.',
             updated_at = '2026-04-23T10:10:00.000Z'
       WHERE task_id = 'task_graph_rename'
    `).run()

    const after = rebuildGraphCoverage({ workspace_id: 'ws_1', project_id: 'proj_1' })
    const taskUnits = after.evidence_units.filter(unit => (
      unit.kind === 'entity'
      && unit.domain === 'task'
      && unit.relationship_type === 'represents'
      && unit.source_refs.some(ref => ref.source_id === 'task_graph_rename')
    ))
    expect(taskUnits).toHaveLength(1)
    expect(taskUnits[0]?.graph_unit_id).toBe(beforeTaskUnit?.graph_unit_id)
    expect(taskUnits[0]?.name).toBe('New graph task title')
    expect(after.domains.task).toMatchObject({ sources: 1, current: 1, stale: 0, failed: 0, status: 'current' })
  })

  it('keeps distinct import and call evidence for multiple names in one chunk', () => {
    const db = getDb()
    db.prepare(`
      INSERT INTO code_files (
        file_id, workspace_id, project_id, rel_path, language, sha256,
        mtime_ns, size_bytes, chunks_count, indexed_at
      ) VALUES ('file_graph_multi', 'ws_1', 'proj_1', 'src/multi.ts', 'typescript', 'sha-file-multi', 0, 200, 1, 0)
    `).run()
    db.prepare(`
      INSERT INTO code_chunks (
        chunk_id, workspace_id, project_id, file_path, file_id,
        chunk_strategy, source_type, content, content_hash, start_line, end_line, symbol_path
      ) VALUES (
        'chunk_graph_multi', 'ws_1', 'proj_1', 'src/multi.ts', 'file_graph_multi',
        'syntax', 'code',
        'import "./alpha.js"; import "./beta.js"; export function run() { alphaCall(); betaCall(); }',
        'hash-chunk-multi', 1, 3, 'run'
      )
    `).run()

    const coverage = rebuildGraphCoverage({ workspace_id: 'ws_1', project_id: 'proj_1' })
    expect(coverage.domains.import).toMatchObject({ sources: 2, current: 2, failed: 0, status: 'current' })
    expect(coverage.domains.call).toMatchObject({ sources: 2, current: 2, failed: 0, status: 'current' })

    const units = readGraphEvidenceUnits({ workspace_id: 'ws_1', project_id: 'proj_1' })
    expect(units.filter(unit => unit.domain === 'import' && unit.kind === 'entity').map(unit => unit.name).sort())
      .toEqual(['./alpha.js', './beta.js'])
    expect(units.filter(unit => unit.domain === 'call' && unit.kind === 'entity').map(unit => unit.name).sort())
      .toEqual(['alphaCall', 'betaCall'])
  })

  it('removes project graph evidence for deleted canonical sources during rebuild', () => {
    const db = getDb()
    db.prepare(`
      INSERT INTO tasks(task_id, workspace_id, project_id, display_id, title, description, status, updated_at)
      VALUES ('task_graph_deleted', 'ws_1', 'proj_1', 'T-DELETE', 'Deleted graph task', 'Before.', 'queued', '2026-04-23T10:00:00.000Z')
    `).run()
    rebuildGraphCoverage({ workspace_id: 'ws_1', project_id: 'proj_1' })
    expect(readGraphEvidenceUnits({ workspace_id: 'ws_1', project_id: 'proj_1' })
      .some(unit => unit.source_refs.some(ref => ref.source_id === 'task_graph_deleted'))).toBe(true)

    db.prepare("DELETE FROM tasks WHERE task_id = 'task_graph_deleted'").run()
    const coverage = rebuildGraphCoverage({ workspace_id: 'ws_1', project_id: 'proj_1' })

    expect(coverage.domains.task).toMatchObject({ sources: 0, status: 'skipped' })
    expect(readGraphEvidenceUnits({ workspace_id: 'ws_1', project_id: 'proj_1' })
      .some(unit => unit.source_refs.some(ref => ref.source_id === 'task_graph_deleted'))).toBe(false)
  })
})
