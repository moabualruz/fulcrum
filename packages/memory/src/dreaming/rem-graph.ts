// v2b PR 11 Task 2.2 — Wire REM entity extraction to Kuzu graph writes.
//
// Upserts Entity nodes and MENTIONS edges from REM-extracted entities.
// Does NOT write Memory↔code edges (MENTIONS_SYMBOL, ABOUT_FILE, ABOUT_SYMBOL)
// — those belong to the v2a PR 7 memory.ts reducer to avoid duplication.

import type { RemEntity } from './rem-extract.js'
import { createHash } from 'node:crypto'

export interface GraphWriteSink {
  upsertNode(node: { table: string; id: string; props: Record<string, unknown> }): Promise<void>
  upsertEdge(edge: {
    table: string
    fromTable: string; fromId: string
    toTable: string; toId: string
    props?: Record<string, unknown>
  }): Promise<void>
}

function entityId(type: string, name: string): string {
  return createHash('sha256').update(`${type}:${name}`).digest('hex').slice(0, 32)
}

export async function wireRemToGraph(
  entities: RemEntity[],
  sink: GraphWriteSink
): Promise<void> {
  // Deduplicate by type+name before writing
  const seen = new Map<string, RemEntity>()
  for (const entity of entities) {
    const key = `${entity.type}:${entity.name}`
    if (!seen.has(key)) seen.set(key, entity)
    else {
      // Merge source IDs
      const existing = seen.get(key)!
      seen.set(key, {
        ...existing,
        sourceIds: [...new Set([...existing.sourceIds, ...entity.sourceIds])],
      })
    }
  }

  for (const entity of seen.values()) {
    const id = entityId(entity.type, entity.name)

    // Upsert Entity node
    await sink.upsertNode({
      table: 'Entity',
      id,
      props: {
        name: entity.name,
        entity_type: entity.type,
        mention_count: entity.sourceIds.length,
      },
    })

    // Upsert MENTIONS edge from each source memory to the entity
    for (const memId of entity.sourceIds) {
      await sink.upsertEdge({
        table: 'MENTIONS',
        fromTable: 'Memory',
        fromId: memId,
        toTable: 'Entity',
        toId: id,
      })
    }
  }
}
