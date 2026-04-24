import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { persistGraphEvidenceUnit, readGraphEvidenceUnits } from '../graph/evidence.js'

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  resetTestDb()
})

describe('graph evidence units', () => {
  it('persists entity and edge evidence with source refs, confidence, freshness, domain, and relationship type', () => {
    const db = getDb()
    db.prepare(`
      INSERT INTO tasks(task_id, workspace_id, project_id, display_id, title, description, status)
      VALUES ('task_evidence', 'ws_1', 'proj_1', 'T-EVIDENCE', 'Evidence task', 'Graph evidence source.', 'queued')
    `).run()

    const taskEntity = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'entity',
      domain: 'task',
      relationship_type: 'represents',
      name: 'Evidence task',
      source_refs: [{ source_domain: 'task', source_id: 'task_evidence', task_id: 'task_evidence', project_id: 'proj_1' }],
      confidence: 0.83,
      freshness: 'current',
      properties: { note: 'operator path /home/mkh/private/task.txt token=sk-proj-secretsecretsecretsecretsecretsecretsecretsecret' },
    })
    const fileEntity = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'entity',
      domain: 'file',
      relationship_type: 'represents',
      name: 'src/evidence.ts',
      source_refs: [{ source_domain: 'file', source_id: 'file_evidence', file_path: '/home/mkh/workspace/pi-stack-plan/src/evidence.ts', project_id: 'proj_1' }],
      confidence: 0.9,
      freshness: 'current',
    })
    const edge = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'edge',
      domain: 'task',
      relationship_type: 'touches_file',
      from_id: taskEntity.graph_unit_id,
      to_id: fileEntity.graph_unit_id,
      source_refs: [{ source_domain: 'task', source_id: 'task_evidence', task_id: 'task_evidence', project_id: 'proj_1' }],
      confidence: 0.77,
      freshness: 'current',
    })

    const units = readGraphEvidenceUnits({ workspace_id: 'ws_1', project_id: 'proj_1' })
    const persistedTask = units.find(unit => unit.graph_unit_id === taskEntity.graph_unit_id)
    const persistedFile = units.find(unit => unit.graph_unit_id === fileEntity.graph_unit_id)
    const persistedEdge = units.find(unit => unit.graph_unit_id === edge.graph_unit_id)

    expect(persistedTask).toMatchObject({
      kind: 'entity',
      domain: 'task',
      relationship_type: 'represents',
      confidence: 0.83,
      freshness: 'current',
    })
    expect(persistedTask?.source_refs[0]).toMatchObject({ source_domain: 'task', source_id: 'task_evidence', task_id: 'task_evidence' })
    expect(persistedFile?.source_refs[0]?.file_path).toBeUndefined()
    expect(persistedFile?.source_refs[0]?.path_fingerprint).toMatch(/^sha256:/)
    expect(persistedEdge).toMatchObject({
      kind: 'edge',
      domain: 'task',
      relationship_type: 'touches_file',
      from_id: taskEntity.graph_unit_id,
      to_id: fileEntity.graph_unit_id,
      confidence: 0.77,
      freshness: 'current',
    })
    expect(JSON.stringify(units)).not.toContain('/home/')
    expect(JSON.stringify(units)).not.toContain('sk-proj-secret')
  })

  it('marks graph evidence stale when the referenced source hash changes', () => {
    const db = getDb()
    db.prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, title, summary, entities, provenance
      ) VALUES (
        'mem_evidence_stale', 'ws_1', 'proj_1', 'decision', 'project',
        'Decision source before change.', 'hash-before',
        3, 'Evidence decision', 'decision', '[]', '{}'
      )
    `).run()
    const entity = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'entity',
      domain: 'decision',
      relationship_type: 'represents',
      name: 'Evidence decision',
      source_refs: [{
        source_domain: 'decision',
        source_id: 'mem_evidence_stale',
        project_id: 'proj_1',
        content_hash: 'hash-before',
      }],
      confidence: 0.8,
      freshness: 'current',
    })

    db.prepare(`
      UPDATE memories
         SET content = 'Decision source after change.',
             content_hash = 'hash-after',
             updated_at = datetime('now', '+1 minute')
       WHERE memory_id = 'mem_evidence_stale'
    `).run()

    const units = readGraphEvidenceUnits({ workspace_id: 'ws_1', project_id: 'proj_1' })
    expect(units.find(unit => unit.graph_unit_id === entity.graph_unit_id)?.freshness).toBe('stale')
  })

  it('keeps hashless but existing sources current instead of treating them as missing', () => {
    const db = getDb()
    db.prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, title, summary, entities, provenance
      ) VALUES (
        'mem_hashless_source', 'ws_1', 'proj_1', 'fact', 'project',
        'Hashless but present source.', NULL,
        3, 'Hashless source', 'fact', '[]', '{}'
      )
    `).run()

    const entity = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'entity',
      domain: 'memory',
      relationship_type: 'represents',
      name: 'Hashless source',
      source_refs: [{ source_domain: 'memory', source_id: 'mem_hashless_source', project_id: 'proj_1' }],
      confidence: 0.8,
      freshness: 'current',
    })

    const units = readGraphEvidenceUnits({ workspace_id: 'ws_1', project_id: 'proj_1' })
    expect(units.find(unit => unit.graph_unit_id === entity.graph_unit_id)?.freshness).toBe('current')
  })

  it('keeps same-name evidence entities isolated by project and source identity', () => {
    const db = getDb()
    db.prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_2', 'ws_1', 'proj_2')").run()

    const projectOne = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'entity',
      domain: 'decision',
      relationship_type: 'represents',
      name: 'Shared roadmap decision',
      source_refs: [{ source_domain: 'decision', source_id: 'mem_shared_decision_1', project_id: 'proj_1' }],
      confidence: 0.7,
      freshness: 'current',
    })
    const projectTwo = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_2',
      kind: 'entity',
      domain: 'decision',
      relationship_type: 'represents',
      name: 'Shared roadmap decision',
      source_refs: [{ source_domain: 'decision', source_id: 'mem_shared_decision_2', project_id: 'proj_2' }],
      confidence: 0.9,
      freshness: 'current',
    })

    expect(projectTwo.graph_unit_id).not.toBe(projectOne.graph_unit_id)
    expect(readGraphEvidenceUnits({ workspace_id: 'ws_1', project_id: 'proj_1' }).map(unit => unit.graph_unit_id))
      .toContain(projectOne.graph_unit_id)
    expect(readGraphEvidenceUnits({ workspace_id: 'ws_1', project_id: 'proj_1' }).map(unit => unit.graph_unit_id))
      .not.toContain(projectTwo.graph_unit_id)
    expect(readGraphEvidenceUnits({ workspace_id: 'ws_1', project_id: 'proj_2' }).map(unit => unit.graph_unit_id))
      .toContain(projectTwo.graph_unit_id)
  })

  it('merges source refs for repeated edge evidence between the same graph nodes', () => {
    const left = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'entity',
      domain: 'task',
      relationship_type: 'represents',
      name: 'Edge merge task',
      source_refs: [{ source_domain: 'task', source_id: 'task_edge_merge', project_id: 'proj_1' }],
      freshness: 'current',
    })
    const right = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'entity',
      domain: 'file',
      relationship_type: 'represents',
      name: 'src/edge-merge.ts',
      source_refs: [{ source_domain: 'file', source_id: 'file_edge_merge', project_id: 'proj_1' }],
      freshness: 'current',
    })

    const first = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'edge',
      domain: 'task',
      relationship_type: 'touches_file',
      from_id: left.graph_unit_id,
      to_id: right.graph_unit_id,
      source_refs: [{ source_domain: 'task', source_id: 'task_edge_merge', project_id: 'proj_1' }],
      freshness: 'current',
    })
    const second = persistGraphEvidenceUnit({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      kind: 'edge',
      domain: 'task',
      relationship_type: 'touches_file',
      from_id: left.graph_unit_id,
      to_id: right.graph_unit_id,
      source_refs: [{ source_domain: 'memory', source_id: 'mem_edge_merge', project_id: 'proj_1' }],
      freshness: 'current',
    })

    expect(second.graph_unit_id).toBe(first.graph_unit_id)
    const edge = readGraphEvidenceUnits({ workspace_id: 'ws_1', project_id: 'proj_1' })
      .find(unit => unit.graph_unit_id === first.graph_unit_id)
    expect(edge?.source_refs.map(ref => ref.source_id).sort()).toEqual(['mem_edge_merge', 'task_edge_merge'])
    expect(edge?.properties.source_ids).toEqual(['task_edge_merge', 'mem_edge_merge'])
  })

  it('excludes unscoped non-evidence graph rows from project evidence reads', () => {
    const db = getDb()
    db.prepare(`
      INSERT INTO graph_entities(entity_id, workspace_id, name, entity_type, properties, created_at, updated_at)
      VALUES ('ent_legacy_unscoped', 'ws_1', 'Legacy unscoped', 'memory', '{}', '2026-04-23T10:00:00.000Z', '2026-04-23T10:00:00.000Z')
    `).run()

    expect(readGraphEvidenceUnits({ workspace_id: 'ws_1', project_id: 'proj_1' })
      .some(unit => unit.graph_unit_id === 'ent_legacy_unscoped')).toBe(false)
  })
})
