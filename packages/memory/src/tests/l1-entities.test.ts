// packages/memory/src/tests/l1-entities.test.ts
//
// Memory v3 PR 2 unit 2.5 — entity graph CRUD + traversal.
//
// graph_entities / graph_edges already exist in the core schema; the v3
// migration (unit 0.2) added aliases, confidence, first_seen, last_confirmed
// to entities and confidence + source_ids to edges. This unit is the typed
// wrapper the validator (unit 2.3 rule 6) and curator (PR 3) call into.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { runMigration101MemoryV3Lifecycle } from '../schema.js'
import {
  upsertEntity,
  addEdge,
  getEntityGraph,
  type EntityRow,
} from '../l1/entities.js'

beforeEach(() => {
  createTestDb()
  runMigration101MemoryV3Lifecycle(getDb())
  seedWorkspaceAndProject(getDb(), 'ws_ent', 'proj_ent')
})

afterEach(() => {
  resetTestDb()
})

describe('upsertEntity', () => {
  it('inserts a new entity with default confidence 1.0', () => {
    const id = upsertEntity({
      workspace_id: 'ws_ent',
      entity_type: 'library',
      name: 'React',
    })
    expect(id).toMatch(/^ent_/)
    const row = getDb()
      .prepare('SELECT * FROM graph_entities WHERE entity_id = ?')
      .get(id) as EntityRow
    expect(row.name).toBe('React')
    expect(row.entity_type).toBe('library')
    expect(row.confidence).toBe(1.0)
    expect(row.first_seen).toBeTruthy()
    expect(row.last_confirmed).toBeTruthy()
  })

  it('merges a second call on the same (workspace, entity_type, name)', () => {
    const a = upsertEntity({ workspace_id: 'ws_ent', entity_type: 'library', name: 'React' })
    const b = upsertEntity({
      workspace_id: 'ws_ent',
      entity_type: 'library',
      name: 'React',
      aliases: ['ReactJS'],
      confidence: 0.8,
    })
    expect(a).toBe(b)
    const row = getDb()
      .prepare('SELECT * FROM graph_entities WHERE entity_id = ?')
      .get(a) as EntityRow
    expect(row.aliases).toBe(JSON.stringify(['ReactJS']))
  })

  it('keeps entities in different workspaces separate', () => {
    seedWorkspaceAndProject(getDb(), 'ws_other', 'proj_other')
    const a = upsertEntity({ workspace_id: 'ws_ent', entity_type: 'library', name: 'React' })
    const b = upsertEntity({ workspace_id: 'ws_other', entity_type: 'library', name: 'React' })
    expect(a).not.toBe(b)
  })

  it('rejects empty name / workspace_id / entity_type', () => {
    expect(() =>
      upsertEntity({ workspace_id: '', entity_type: 'x', name: 'y' }),
    ).toThrow(/workspace_id/)
    expect(() =>
      upsertEntity({ workspace_id: 'ws_ent', entity_type: '', name: 'y' }),
    ).toThrow(/entity_type/)
    expect(() =>
      upsertEntity({ workspace_id: 'ws_ent', entity_type: 'x', name: '' }),
    ).toThrow(/name/)
  })

  it('clamps confidence to [0.0, 1.0]', () => {
    expect(() =>
      upsertEntity({ workspace_id: 'ws_ent', entity_type: 'library', name: 'Bad', confidence: 1.5 }),
    ).toThrow(/confidence/)
    expect(() =>
      upsertEntity({ workspace_id: 'ws_ent', entity_type: 'library', name: 'Bad', confidence: -0.1 }),
    ).toThrow(/confidence/)
  })
})

describe('addEdge', () => {
  it('inserts a typed relation between two entities', () => {
    const react = upsertEntity({ workspace_id: 'ws_ent', entity_type: 'library', name: 'React' })
    const hook = upsertEntity({ workspace_id: 'ws_ent', entity_type: 'concept', name: 'Hooks' })
    const id = addEdge({
      workspace_id: 'ws_ent',
      source_id: react,
      target_id: hook,
      relation: 'exposes',
    })
    expect(id).toMatch(/^edg_/)
    const row = getDb()
      .prepare('SELECT * FROM graph_edges WHERE edge_id = ?')
      .get(id) as { source_id: string; target_id: string; relation: string; confidence: number }
    expect(row.source_id).toBe(react)
    expect(row.target_id).toBe(hook)
    expect(row.relation).toBe('exposes')
    expect(row.confidence).toBe(1.0)
  })

  it('rejects edges to unknown entities', () => {
    const react = upsertEntity({ workspace_id: 'ws_ent', entity_type: 'library', name: 'React' })
    expect(() =>
      addEdge({
        workspace_id: 'ws_ent',
        source_id: react,
        target_id: 'ent_nonexistent',
        relation: 'uses',
      }),
    ).toThrow(/target_id/)
  })

  it('stores source_ids as JSON and carries a confidence', () => {
    const a = upsertEntity({ workspace_id: 'ws_ent', entity_type: 'library', name: 'A' })
    const b = upsertEntity({ workspace_id: 'ws_ent', entity_type: 'library', name: 'B' })
    const id = addEdge({
      workspace_id: 'ws_ent',
      source_id: a,
      target_id: b,
      relation: 'imports',
      confidence: 0.75,
      source_ids: ['01KL0_1', '01KL0_2'],
    })
    const row = getDb()
      .prepare('SELECT confidence, source_ids FROM graph_edges WHERE edge_id = ?')
      .get(id) as { confidence: number; source_ids: string }
    expect(row.confidence).toBe(0.75)
    expect(JSON.parse(row.source_ids)).toEqual(['01KL0_1', '01KL0_2'])
  })
})

describe('getEntityGraph', () => {
  it('returns the seed entity with empty edges when depth=0', () => {
    const react = upsertEntity({ workspace_id: 'ws_ent', entity_type: 'library', name: 'React' })
    const g = getEntityGraph(react, 0)
    expect(g.nodes.map((n) => n.entity_id)).toEqual([react])
    expect(g.edges).toEqual([])
  })

  it('walks 1-hop outgoing + incoming edges', () => {
    const react = upsertEntity({ workspace_id: 'ws_ent', entity_type: 'library', name: 'React' })
    const hook = upsertEntity({ workspace_id: 'ws_ent', entity_type: 'concept', name: 'Hooks' })
    const dom = upsertEntity({ workspace_id: 'ws_ent', entity_type: 'concept', name: 'DOM' })
    addEdge({ workspace_id: 'ws_ent', source_id: react, target_id: hook, relation: 'exposes' })
    addEdge({ workspace_id: 'ws_ent', source_id: dom, target_id: react, relation: 'consumes' })
    const g = getEntityGraph(react, 1)
    expect(new Set(g.nodes.map((n) => n.entity_id))).toEqual(new Set([react, hook, dom]))
    expect(g.edges).toHaveLength(2)
  })

  it('respects depth=2', () => {
    const a = upsertEntity({ workspace_id: 'ws_ent', entity_type: 'library', name: 'A' })
    const b = upsertEntity({ workspace_id: 'ws_ent', entity_type: 'library', name: 'B' })
    const c = upsertEntity({ workspace_id: 'ws_ent', entity_type: 'library', name: 'C' })
    const d = upsertEntity({ workspace_id: 'ws_ent', entity_type: 'library', name: 'D' })
    addEdge({ workspace_id: 'ws_ent', source_id: a, target_id: b, relation: 'r1' })
    addEdge({ workspace_id: 'ws_ent', source_id: b, target_id: c, relation: 'r2' })
    addEdge({ workspace_id: 'ws_ent', source_id: c, target_id: d, relation: 'r3' })
    const g1 = getEntityGraph(a, 1)
    expect(new Set(g1.nodes.map((n) => n.entity_id))).toEqual(new Set([a, b]))
    const g2 = getEntityGraph(a, 2)
    expect(new Set(g2.nodes.map((n) => n.entity_id))).toEqual(new Set([a, b, c]))
  })

  it('throws when seed entity does not exist', () => {
    expect(() => getEntityGraph('ent_nonexistent', 1)).toThrow(/entity/)
  })
})
