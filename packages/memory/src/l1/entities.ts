// packages/memory/src/l1/entities.ts
//
// Memory v3 PR 2 unit 2.5 — entity graph CRUD + traversal.
//
// Typed wrapper over graph_entities / graph_edges. The v3 lifecycle migration
// (unit 0.2) added aliases, confidence, first_seen, last_confirmed to entities
// and confidence + source_ids to edges; this module is the only supported
// writer path for those columns. Validator rule 6 (unit 2.3) calls into
// `entityExists` to check page `entities[]` before accepting a write.

import { getDb, newId } from 'fulcrum-agent-core'

export type EntityRow = {
  entity_id: string
  workspace_id: string
  name: string
  entity_type: string
  properties: string
  aliases: string | null
  confidence: number
  first_seen: string | null
  last_confirmed: string | null
  valid_from: string | null
  valid_until: string | null
  created_at: string
  updated_at: string
}

export type EdgeRow = {
  edge_id: string
  workspace_id: string
  source_id: string
  target_id: string
  relation: string
  weight: number
  properties: string
  confidence: number
  source_ids: string | null
  valid_from: string | null
  valid_until: string | null
  created_at: string
}

export type UpsertEntityInput = {
  workspace_id: string
  entity_type: string
  name: string
  aliases?: string[]
  confidence?: number
  properties?: Record<string, unknown>
}

export type AddEdgeInput = {
  workspace_id: string
  source_id: string
  target_id: string
  relation: string
  confidence?: number
  source_ids?: string[]
  properties?: Record<string, unknown>
}

export type EntityGraph = {
  nodes: EntityRow[]
  edges: EdgeRow[]
}

function nowIso(): string {
  return new Date().toISOString()
}

function requireNonEmpty(field: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`upsertEntity/addEdge: '${field}' must be a non-empty string`)
  }
}

function requireConfidenceRange(value: number | undefined): void {
  if (value === undefined) return
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`confidence must be in [0.0, 1.0] (got ${value})`)
  }
}

/**
 * Insert or merge an entity by (workspace_id, entity_type, name). Returns the
 * entity_id. On a match, only aliases/properties/last_confirmed are refreshed;
 * confidence is set to the max of old and new so repeat observations can only
 * reinforce, never downgrade silently.
 */
export function upsertEntity(input: UpsertEntityInput): string {
  requireNonEmpty('workspace_id', input.workspace_id)
  requireNonEmpty('entity_type', input.entity_type)
  requireNonEmpty('name', input.name)
  requireConfidenceRange(input.confidence)

  const db = getDb()
  const existing = db
    .prepare(
      'SELECT entity_id, confidence FROM graph_entities WHERE workspace_id = ? AND entity_type = ? AND name = ?',
    )
    .get(input.workspace_id, input.entity_type, input.name) as
    | { entity_id: string; confidence: number }
    | undefined

  const now = nowIso()
  const aliasesJson = input.aliases && input.aliases.length > 0 ? JSON.stringify(input.aliases) : null
  const propertiesJson = JSON.stringify(input.properties ?? {})

  if (existing) {
    const nextConfidence = input.confidence !== undefined
      ? Math.max(existing.confidence, input.confidence)
      : existing.confidence
    db.prepare(
      `UPDATE graph_entities
       SET aliases        = COALESCE(?, aliases),
           properties     = ?,
           confidence     = ?,
           last_confirmed = ?,
           updated_at     = ?
       WHERE entity_id = ?`,
    ).run(aliasesJson, propertiesJson, nextConfidence, now, now, existing.entity_id)
    return existing.entity_id
  }

  const entity_id = newId('graph_entity')
  db.prepare(
    `INSERT INTO graph_entities
       (entity_id, workspace_id, name, entity_type, properties,
        aliases, confidence, first_seen, last_confirmed,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entity_id,
    input.workspace_id,
    input.name,
    input.entity_type,
    propertiesJson,
    aliasesJson,
    input.confidence ?? 1.0,
    now,
    now,
    now,
    now,
  )
  return entity_id
}

/**
 * Insert a directed edge between two existing entities. Rejects if either
 * endpoint does not exist — graph integrity belongs to this layer.
 */
export function addEdge(input: AddEdgeInput): string {
  requireNonEmpty('workspace_id', input.workspace_id)
  requireNonEmpty('source_id', input.source_id)
  requireNonEmpty('target_id', input.target_id)
  requireNonEmpty('relation', input.relation)
  requireConfidenceRange(input.confidence)

  const db = getDb()
  for (const [field, id] of [['source_id', input.source_id], ['target_id', input.target_id]] as const) {
    const exists = db
      .prepare('SELECT 1 FROM graph_entities WHERE entity_id = ? AND workspace_id = ?')
      .get(id, input.workspace_id)
    if (!exists) throw new Error(`addEdge: '${field}' (${id}) does not exist in workspace '${input.workspace_id}'`)
  }

  const edge_id = newId('graph_edge')
  const now = nowIso()
  db.prepare(
    `INSERT INTO graph_edges
       (edge_id, workspace_id, source_id, target_id, relation,
        weight, properties, confidence, source_ids, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    edge_id,
    input.workspace_id,
    input.source_id,
    input.target_id,
    input.relation,
    1.0,
    JSON.stringify(input.properties ?? {}),
    input.confidence ?? 1.0,
    input.source_ids && input.source_ids.length > 0 ? JSON.stringify(input.source_ids) : null,
    now,
  )
  return edge_id
}

/**
 * BFS traversal from `seed_entity_id` up to `depth` hops, following both
 * outgoing and incoming edges. Returns unique nodes + edges. depth=0 returns
 * just the seed.
 */
export function getEntityGraph(seed_entity_id: string, depth: number): EntityGraph {
  const db = getDb()
  const seed = db
    .prepare('SELECT * FROM graph_entities WHERE entity_id = ?')
    .get(seed_entity_id) as EntityRow | undefined
  if (!seed) throw new Error(`getEntityGraph: entity '${seed_entity_id}' not found`)

  const nodes = new Map<string, EntityRow>([[seed_entity_id, seed]])
  const edges = new Map<string, EdgeRow>()

  let frontier = new Set<string>([seed_entity_id])
  for (let hop = 0; hop < depth; hop++) {
    if (frontier.size === 0) break
    const next = new Set<string>()
    for (const id of frontier) {
      const hopEdges = db
        .prepare(
          `SELECT * FROM graph_edges
           WHERE source_id = ? OR target_id = ?`,
        )
        .all(id, id) as EdgeRow[]
      for (const edge of hopEdges) {
        if (edges.has(edge.edge_id)) continue
        edges.set(edge.edge_id, edge)
        const neighbour = edge.source_id === id ? edge.target_id : edge.source_id
        if (!nodes.has(neighbour)) {
          const row = db
            .prepare('SELECT * FROM graph_entities WHERE entity_id = ?')
            .get(neighbour) as EntityRow | undefined
          if (row) {
            nodes.set(neighbour, row)
            next.add(neighbour)
          }
        }
      }
    }
    frontier = next
  }

  return { nodes: Array.from(nodes.values()), edges: Array.from(edges.values()) }
}

/**
 * Cheap existence check used by the validator (unit 2.3 rule 6).
 */
export function entityExists(entity_id: string): boolean {
  return Boolean(
    getDb().prepare('SELECT 1 FROM graph_entities WHERE entity_id = ?').get(entity_id),
  )
}
