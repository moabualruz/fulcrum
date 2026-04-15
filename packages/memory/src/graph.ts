// packages/memory/src/graph.ts
import { ulid } from 'ulidx'
import type Database from 'better-sqlite3'
import type {
  GraphEntity,
  GraphEdge,
  GraphEpisode,
  AddEntityInput,
  AddEdgeInput,
  AddEpisodeInput,
  GetNeighborsInput,
  SearchEntitiesInput,
} from './graph-types.js'

// --- Row mappers ---

function rowToEntity(row: Record<string, unknown>): GraphEntity {
  return {
    entity_id: row.entity_id as string,
    workspace_id: row.workspace_id as string,
    name: row.name as string,
    entity_type: row.entity_type as string,
    properties: JSON.parse(row.properties as string) as Record<string, unknown>,
    valid_from: (row.valid_from as string | null) ?? undefined,
    valid_until: (row.valid_until as string | null) ?? undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

function rowToEdge(row: Record<string, unknown>): GraphEdge {
  return {
    edge_id: row.edge_id as string,
    workspace_id: row.workspace_id as string,
    source_id: row.source_id as string,
    target_id: row.target_id as string,
    relation: row.relation as string,
    weight: row.weight as number,
    properties: JSON.parse(row.properties as string) as Record<string, unknown>,
    valid_from: (row.valid_from as string | null) ?? undefined,
    valid_until: (row.valid_until as string | null) ?? undefined,
    created_at: row.created_at as string,
  }
}

function rowToEpisode(row: Record<string, unknown>): GraphEpisode {
  return {
    episode_id: row.episode_id as string,
    workspace_id: row.workspace_id as string,
    entity_id: row.entity_id as string,
    content: row.content as string,
    episode_type: row.episode_type as string,
    valid_from: (row.valid_from as string | null) ?? undefined,
    valid_until: (row.valid_until as string | null) ?? undefined,
    created_at: row.created_at as string,
  }
}

// --- Public API ---

/**
 * Upsert an entity by (workspace_id, name, entity_type).
 * If an entity with the same workspace_id+name+entity_type already exists,
 * update its properties, valid_from, valid_until and updated_at.
 */
export function addEntity(db: Database.Database, input: AddEntityInput): GraphEntity {
  const now = new Date().toISOString()
  const propsJson = JSON.stringify(input.properties ?? {})

  // Check for existing entity to upsert
  const existing = db.prepare(
    'SELECT entity_id FROM graph_entities WHERE workspace_id = ? AND name = ? AND entity_type = ?'
  ).get(input.workspace_id, input.name, input.entity_type) as { entity_id: string } | undefined

  if (existing) {
    db.prepare(`
      UPDATE graph_entities
      SET properties = ?, valid_from = ?, valid_until = ?, updated_at = ?
      WHERE entity_id = ?
    `).run(
      propsJson,
      input.valid_from ?? null,
      input.valid_until ?? null,
      now,
      existing.entity_id
    )
    const row = db.prepare('SELECT * FROM graph_entities WHERE entity_id = ?')
      .get(existing.entity_id) as Record<string, unknown>
    return rowToEntity(row)
  }

  const entity_id = ulid()
  db.prepare(`
    INSERT INTO graph_entities
      (entity_id, workspace_id, name, entity_type, properties, valid_from, valid_until, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entity_id,
    input.workspace_id,
    input.name,
    input.entity_type,
    propsJson,
    input.valid_from ?? null,
    input.valid_until ?? null,
    now,
    now
  )

  const row = db.prepare('SELECT * FROM graph_entities WHERE entity_id = ?')
    .get(entity_id) as Record<string, unknown>
  return rowToEntity(row)
}

export function getEntity(db: Database.Database, entity_id: string, workspace_id: string): GraphEntity | null {
  const row = db.prepare(
    'SELECT * FROM graph_entities WHERE entity_id = ? AND workspace_id = ?'
  ).get(entity_id, workspace_id) as Record<string, unknown> | undefined
  return row ? rowToEntity(row) : null
}

export function searchEntities(db: Database.Database, input: SearchEntitiesInput): GraphEntity[] {
  const limit = input.limit ?? 20
  const pattern = `%${input.query}%`

  const clauses: string[] = [
    'workspace_id = ?',
    '(name LIKE ? OR entity_type LIKE ?)',
  ]
  const params: unknown[] = [input.workspace_id, pattern, pattern]

  if (input.entity_type) {
    clauses.push('entity_type = ?')
    params.push(input.entity_type)
  }

  if (input.at) {
    clauses.push('(valid_from IS NULL OR valid_from <= ?)')
    clauses.push('(valid_until IS NULL OR valid_until > ?)')
    params.push(input.at, input.at)
  }

  params.push(limit)

  const rows = db.prepare(
    `SELECT * FROM graph_entities WHERE ${clauses.join(' AND ')} LIMIT ?`
  ).all(...params) as Record<string, unknown>[]

  return rows.map(rowToEntity)
}

export function addEdge(db: Database.Database, input: AddEdgeInput): GraphEdge {
  const now = new Date().toISOString()
  const edge_id = ulid()
  const propsJson = JSON.stringify(input.properties ?? {})

  db.prepare(`
    INSERT INTO graph_edges
      (edge_id, workspace_id, source_id, target_id, relation, weight, properties, valid_from, valid_until, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    edge_id,
    input.workspace_id,
    input.source_id,
    input.target_id,
    input.relation,
    input.weight ?? 1.0,
    propsJson,
    input.valid_from ?? null,
    input.valid_until ?? null,
    now
  )

  const row = db.prepare('SELECT * FROM graph_edges WHERE edge_id = ?')
    .get(edge_id) as Record<string, unknown>
  return rowToEdge(row)
}

export function getNeighbors(
  db: Database.Database,
  input: GetNeighborsInput
): Array<{ entity: GraphEntity; edge: GraphEdge }> {
  const direction = input.direction ?? 'both'
  const results: Array<{ entity: GraphEntity; edge: GraphEdge }> = []

  const buildTemporalClauses = (alias: string): { sql: string; params: unknown[] } => {
    if (!input.at) return { sql: '', params: [] }
    return {
      sql: ` AND (${alias}.valid_from IS NULL OR ${alias}.valid_from <= ?) AND (${alias}.valid_until IS NULL OR ${alias}.valid_until > ?)`,
      params: [input.at, input.at],
    }
  }

  const relationClause = input.relation ? ' AND e.relation = ?' : ''

  // Outbound: entity_id is source
  if (direction === 'outbound' || direction === 'both') {
    const temporal = buildTemporalClauses('e')
    const params: unknown[] = [input.workspace_id, input.entity_id]
    if (input.relation) params.push(input.relation)
    params.push(...temporal.params)

    const rows = db.prepare(`
      SELECT
        ent.entity_id, ent.workspace_id, ent.name, ent.entity_type,
        ent.properties AS ent_properties, ent.valid_from AS ent_valid_from,
        ent.valid_until AS ent_valid_until, ent.created_at AS ent_created_at,
        ent.updated_at AS ent_updated_at,
        e.edge_id, e.source_id, e.target_id, e.relation, e.weight,
        e.properties AS edge_properties, e.valid_from AS edge_valid_from,
        e.valid_until AS edge_valid_until, e.created_at AS edge_created_at
      FROM graph_edges e
      JOIN graph_entities ent ON ent.entity_id = e.target_id
      WHERE e.workspace_id = ? AND e.source_id = ?${relationClause}${temporal.sql}
    `).all(...params) as Record<string, unknown>[]

    for (const row of rows) {
      results.push({
        entity: rowToEntity({
          entity_id: row.entity_id,
          workspace_id: row.workspace_id,
          name: row.name,
          entity_type: row.entity_type,
          properties: row.ent_properties,
          valid_from: row.ent_valid_from,
          valid_until: row.ent_valid_until,
          created_at: row.ent_created_at,
          updated_at: row.ent_updated_at,
        }),
        edge: rowToEdge({
          edge_id: row.edge_id,
          workspace_id: row.workspace_id,
          source_id: row.source_id,
          target_id: row.target_id,
          relation: row.relation,
          weight: row.weight,
          properties: row.edge_properties,
          valid_from: row.edge_valid_from,
          valid_until: row.edge_valid_until,
          created_at: row.edge_created_at,
        }),
      })
    }
  }

  // Inbound: entity_id is target
  if (direction === 'inbound' || direction === 'both') {
    const temporal = buildTemporalClauses('e')
    const params: unknown[] = [input.workspace_id, input.entity_id]
    if (input.relation) params.push(input.relation)
    params.push(...temporal.params)

    const rows = db.prepare(`
      SELECT
        ent.entity_id, ent.workspace_id, ent.name, ent.entity_type,
        ent.properties AS ent_properties, ent.valid_from AS ent_valid_from,
        ent.valid_until AS ent_valid_until, ent.created_at AS ent_created_at,
        ent.updated_at AS ent_updated_at,
        e.edge_id, e.source_id, e.target_id, e.relation, e.weight,
        e.properties AS edge_properties, e.valid_from AS edge_valid_from,
        e.valid_until AS edge_valid_until, e.created_at AS edge_created_at
      FROM graph_edges e
      JOIN graph_entities ent ON ent.entity_id = e.source_id
      WHERE e.workspace_id = ? AND e.target_id = ?${relationClause}${temporal.sql}
    `).all(...params) as Record<string, unknown>[]

    for (const row of rows) {
      results.push({
        entity: rowToEntity({
          entity_id: row.entity_id,
          workspace_id: row.workspace_id,
          name: row.name,
          entity_type: row.entity_type,
          properties: row.ent_properties,
          valid_from: row.ent_valid_from,
          valid_until: row.ent_valid_until,
          created_at: row.ent_created_at,
          updated_at: row.ent_updated_at,
        }),
        edge: rowToEdge({
          edge_id: row.edge_id,
          workspace_id: row.workspace_id,
          source_id: row.source_id,
          target_id: row.target_id,
          relation: row.relation,
          weight: row.weight,
          properties: row.edge_properties,
          valid_from: row.edge_valid_from,
          valid_until: row.edge_valid_until,
          created_at: row.edge_created_at,
        }),
      })
    }
  }

  return results
}

export function addEpisode(db: Database.Database, input: AddEpisodeInput): GraphEpisode {
  const now = new Date().toISOString()
  const episode_id = ulid()

  db.prepare(`
    INSERT INTO graph_episodes
      (episode_id, workspace_id, entity_id, content, episode_type, valid_from, valid_until, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    episode_id,
    input.workspace_id,
    input.entity_id,
    input.content,
    input.episode_type ?? 'observation',
    input.valid_from ?? null,
    input.valid_until ?? null,
    now
  )

  const row = db.prepare('SELECT * FROM graph_episodes WHERE episode_id = ?')
    .get(episode_id) as Record<string, unknown>
  return rowToEpisode(row)
}

export function getEpisodes(
  db: Database.Database,
  entity_id: string,
  workspace_id: string,
  at?: string
): GraphEpisode[] {
  const clauses: string[] = ['workspace_id = ?', 'entity_id = ?']
  const params: unknown[] = [workspace_id, entity_id]

  if (at) {
    clauses.push('(valid_from IS NULL OR valid_from <= ?)')
    clauses.push('(valid_until IS NULL OR valid_until > ?)')
    params.push(at, at)
  }

  const rows = db.prepare(
    `SELECT * FROM graph_episodes WHERE ${clauses.join(' AND ')} ORDER BY created_at ASC`
  ).all(...params) as Record<string, unknown>[]

  return rows.map(rowToEpisode)
}
