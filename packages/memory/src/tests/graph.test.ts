// packages/memory/src/tests/graph.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from '@fulcrum/core'
import {
  addEntity,
  getEntity,
  searchEntities,
  addEdge,
  getNeighbors,
  addEpisode,
  getEpisodes,
} from '../graph.js'

beforeEach(() => { createTestDb() })
afterEach(() => resetTestDb())

describe('addEntity', () => {
  it('creates an entity and returns it with parsed properties', () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const entity = addEntity(db, {
      workspace_id: 'ws_1',
      name: 'Alice',
      entity_type: 'person',
      properties: { role: 'engineer', level: 5 },
    })
    expect(entity.entity_id).toBeTruthy()
    expect(entity.name).toBe('Alice')
    expect(entity.entity_type).toBe('person')
    expect(entity.properties).toEqual({ role: 'engineer', level: 5 })
    expect(entity.workspace_id).toBe('ws_1')
    expect(entity.created_at).toBeTruthy()
    expect(entity.updated_at).toBeTruthy()
  })

  it('upserts on duplicate (workspace_id, name, entity_type) — updates properties', () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const first = addEntity(db, {
      workspace_id: 'ws_1',
      name: 'Alice',
      entity_type: 'person',
      properties: { role: 'engineer' },
    })
    const second = addEntity(db, {
      workspace_id: 'ws_1',
      name: 'Alice',
      entity_type: 'person',
      properties: { role: 'lead' },
    })
    expect(second.entity_id).toBe(first.entity_id)
    expect(second.properties).toEqual({ role: 'lead' })
    const count = (db.prepare('SELECT COUNT(*) as c FROM graph_entities').get() as { c: number }).c
    expect(count).toBe(1)
  })

  it('defaults properties to empty object when not provided', () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const entity = addEntity(db, {
      workspace_id: 'ws_1',
      name: 'Bob',
      entity_type: 'service',
    })
    expect(entity.properties).toEqual({})
  })

  it('stores and returns valid_from / valid_until', () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const entity = addEntity(db, {
      workspace_id: 'ws_1',
      name: 'TempNode',
      entity_type: 'concept',
      valid_from: '2024-01-01T00:00:00.000Z',
      valid_until: '2025-01-01T00:00:00.000Z',
    })
    expect(entity.valid_from).toBe('2024-01-01T00:00:00.000Z')
    expect(entity.valid_until).toBe('2025-01-01T00:00:00.000Z')
  })
})

describe('getEntity', () => {
  it('returns null when entity not found', () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    expect(getEntity(db, 'nonexistent_id', 'ws_1')).toBeNull()
  })

  it('returns the entity when found', () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const created = addEntity(db, {
      workspace_id: 'ws_1',
      name: 'Alice',
      entity_type: 'person',
    })
    const fetched = getEntity(db, created.entity_id, 'ws_1')
    expect(fetched).not.toBeNull()
    expect(fetched!.name).toBe('Alice')
  })

  it('returns null when workspace_id does not match', () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const created = addEntity(db, {
      workspace_id: 'ws_1',
      name: 'Alice',
      entity_type: 'person',
    })
    expect(getEntity(db, created.entity_id, 'ws_other')).toBeNull()
  })
})

describe('searchEntities', () => {
  it('finds entities by name (case-insensitive LIKE)', () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    addEntity(db, { workspace_id: 'ws_1', name: 'Alice Smith', entity_type: 'person' })
    addEntity(db, { workspace_id: 'ws_1', name: 'Bob Jones', entity_type: 'person' })

    const results = searchEntities(db, { workspace_id: 'ws_1', query: 'alice' })
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('Alice Smith')
  })

  it('finds entities by entity_type via LIKE', () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    addEntity(db, { workspace_id: 'ws_1', name: 'AuthService', entity_type: 'microservice' })
    addEntity(db, { workspace_id: 'ws_1', name: 'User', entity_type: 'model' })

    const results = searchEntities(db, { workspace_id: 'ws_1', query: 'microservice' })
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('AuthService')
  })

  it('filters by entity_type when provided', () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    addEntity(db, { workspace_id: 'ws_1', name: 'Alice', entity_type: 'person' })
    addEntity(db, { workspace_id: 'ws_1', name: 'AliceService', entity_type: 'service' })

    const results = searchEntities(db, { workspace_id: 'ws_1', query: 'alice', entity_type: 'service' })
    expect(results).toHaveLength(1)
    expect(results[0].entity_type).toBe('service')
  })

  it('respects limit', () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    for (let i = 1; i <= 5; i++) {
      addEntity(db, { workspace_id: 'ws_1', name: `Entity${i}`, entity_type: 'thing' })
    }
    const results = searchEntities(db, { workspace_id: 'ws_1', query: 'Entity', limit: 3 })
    expect(results).toHaveLength(3)
  })

  it('filters by temporal validity when at is provided', () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    // Active at 2024-06-01
    addEntity(db, {
      workspace_id: 'ws_1',
      name: 'CurrentNode',
      entity_type: 'concept',
      valid_from: '2024-01-01T00:00:00.000Z',
      valid_until: '2025-01-01T00:00:00.000Z',
    })
    // Expired before query time
    addEntity(db, {
      workspace_id: 'ws_1',
      name: 'OldNode',
      entity_type: 'concept',
      valid_from: '2023-01-01T00:00:00.000Z',
      valid_until: '2024-01-01T00:00:00.000Z',
    })

    const results = searchEntities(db, {
      workspace_id: 'ws_1',
      query: 'Node',
      at: '2024-06-01T00:00:00.000Z',
    })
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('CurrentNode')
  })

  it('does not leak results from other workspaces', () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    db.prepare("INSERT OR IGNORE INTO workspaces(workspace_id, name) VALUES ('ws_2', 'ws2')").run()
    addEntity(db, { workspace_id: 'ws_1', name: 'AliceInWs1', entity_type: 'person' })
    addEntity(db, { workspace_id: 'ws_2', name: 'AliceInWs2', entity_type: 'person' })

    const results = searchEntities(db, { workspace_id: 'ws_1', query: 'Alice' })
    expect(results).toHaveLength(1)
    expect(results[0].workspace_id).toBe('ws_1')
  })
})

describe('addEdge + getNeighbors', () => {
  it('creates an edge between two entities', () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const a = addEntity(db, { workspace_id: 'ws_1', name: 'A', entity_type: 'node' })
    const b = addEntity(db, { workspace_id: 'ws_1', name: 'B', entity_type: 'node' })
    const edge = addEdge(db, {
      workspace_id: 'ws_1',
      source_id: a.entity_id,
      target_id: b.entity_id,
      relation: 'depends_on',
      weight: 0.8,
      properties: { since: '2024' },
    })
    expect(edge.edge_id).toBeTruthy()
    expect(edge.relation).toBe('depends_on')
    expect(edge.weight).toBe(0.8)
    expect(edge.properties).toEqual({ since: '2024' })
  })

  it('getNeighbors outbound returns target entities', () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const a = addEntity(db, { workspace_id: 'ws_1', name: 'A', entity_type: 'node' })
    const b = addEntity(db, { workspace_id: 'ws_1', name: 'B', entity_type: 'node' })
    addEdge(db, { workspace_id: 'ws_1', source_id: a.entity_id, target_id: b.entity_id, relation: 'links_to' })

    const neighbors = getNeighbors(db, { workspace_id: 'ws_1', entity_id: a.entity_id, direction: 'outbound' })
    expect(neighbors).toHaveLength(1)
    expect(neighbors[0].entity.entity_id).toBe(b.entity_id)
    expect(neighbors[0].edge.relation).toBe('links_to')
  })

  it('getNeighbors inbound returns source entities', () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const a = addEntity(db, { workspace_id: 'ws_1', name: 'A', entity_type: 'node' })
    const b = addEntity(db, { workspace_id: 'ws_1', name: 'B', entity_type: 'node' })
    addEdge(db, { workspace_id: 'ws_1', source_id: a.entity_id, target_id: b.entity_id, relation: 'links_to' })

    const neighbors = getNeighbors(db, { workspace_id: 'ws_1', entity_id: b.entity_id, direction: 'inbound' })
    expect(neighbors).toHaveLength(1)
    expect(neighbors[0].entity.entity_id).toBe(a.entity_id)
  })

  it('getNeighbors both direction returns all connected entities', () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const a = addEntity(db, { workspace_id: 'ws_1', name: 'A', entity_type: 'node' })
    const b = addEntity(db, { workspace_id: 'ws_1', name: 'B', entity_type: 'node' })
    const c = addEntity(db, { workspace_id: 'ws_1', name: 'C', entity_type: 'node' })
    addEdge(db, { workspace_id: 'ws_1', source_id: a.entity_id, target_id: b.entity_id, relation: 'rel' })
    addEdge(db, { workspace_id: 'ws_1', source_id: c.entity_id, target_id: a.entity_id, relation: 'rel' })

    const neighbors = getNeighbors(db, { workspace_id: 'ws_1', entity_id: a.entity_id, direction: 'both' })
    expect(neighbors).toHaveLength(2)
    const entityIds = neighbors.map(n => n.entity.entity_id)
    expect(entityIds).toContain(b.entity_id)
    expect(entityIds).toContain(c.entity_id)
  })

  it('filters by relation', () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const a = addEntity(db, { workspace_id: 'ws_1', name: 'A', entity_type: 'node' })
    const b = addEntity(db, { workspace_id: 'ws_1', name: 'B', entity_type: 'node' })
    const c_node = addEntity(db, { workspace_id: 'ws_1', name: 'C', entity_type: 'node' })
    addEdge(db, { workspace_id: 'ws_1', source_id: a.entity_id, target_id: b.entity_id, relation: 'depends_on' })
    addEdge(db, { workspace_id: 'ws_1', source_id: a.entity_id, target_id: c_node.entity_id, relation: 'knows' })

    const neighbors = getNeighbors(db, {
      workspace_id: 'ws_1',
      entity_id: a.entity_id,
      direction: 'outbound',
      relation: 'depends_on',
    })
    expect(neighbors).toHaveLength(1)
    expect(neighbors[0].entity.entity_id).toBe(b.entity_id)
  })
})

describe('addEpisode + getEpisodes', () => {
  it('creates an episode and retrieves it', () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const entity = addEntity(db, { workspace_id: 'ws_1', name: 'Alice', entity_type: 'person' })
    const episode = addEpisode(db, {
      workspace_id: 'ws_1',
      entity_id: entity.entity_id,
      content: 'Alice joined the team today',
      episode_type: 'event',
    })
    expect(episode.episode_id).toBeTruthy()
    expect(episode.content).toBe('Alice joined the team today')
    expect(episode.episode_type).toBe('event')

    const episodes = getEpisodes(db, entity.entity_id, 'ws_1')
    expect(episodes).toHaveLength(1)
    expect(episodes[0].episode_id).toBe(episode.episode_id)
  })

  it('defaults episode_type to observation', () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const entity = addEntity(db, { workspace_id: 'ws_1', name: 'Bob', entity_type: 'person' })
    const episode = addEpisode(db, {
      workspace_id: 'ws_1',
      entity_id: entity.entity_id,
      content: 'Bob fixed a bug',
    })
    expect(episode.episode_type).toBe('observation')
  })

  it('returns multiple episodes in insertion order', () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const entity = addEntity(db, { workspace_id: 'ws_1', name: 'Alice', entity_type: 'person' })
    addEpisode(db, { workspace_id: 'ws_1', entity_id: entity.entity_id, content: 'First event' })
    addEpisode(db, { workspace_id: 'ws_1', entity_id: entity.entity_id, content: 'Second event' })

    const episodes = getEpisodes(db, entity.entity_id, 'ws_1')
    expect(episodes).toHaveLength(2)
    expect(episodes[0].content).toBe('First event')
    expect(episodes[1].content).toBe('Second event')
  })

  it('filters by temporal validity when at is provided', () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const entity = addEntity(db, { workspace_id: 'ws_1', name: 'Alice', entity_type: 'person' })
    // Active at 2024-06-01
    addEpisode(db, {
      workspace_id: 'ws_1',
      entity_id: entity.entity_id,
      content: 'Current episode',
      valid_from: '2024-01-01T00:00:00.000Z',
      valid_until: '2025-01-01T00:00:00.000Z',
    })
    // Already expired
    addEpisode(db, {
      workspace_id: 'ws_1',
      entity_id: entity.entity_id,
      content: 'Old episode',
      valid_from: '2023-01-01T00:00:00.000Z',
      valid_until: '2024-01-01T00:00:00.000Z',
    })

    const episodes = getEpisodes(db, entity.entity_id, 'ws_1', '2024-06-01T00:00:00.000Z')
    expect(episodes).toHaveLength(1)
    expect(episodes[0].content).toBe('Current episode')
  })

  it('returns empty array when no episodes exist', () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const entity = addEntity(db, { workspace_id: 'ws_1', name: 'Alice', entity_type: 'person' })
    expect(getEpisodes(db, entity.entity_id, 'ws_1')).toEqual([])
  })
})
