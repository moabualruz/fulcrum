// packages/memory/src/kuzu/upsert.ts
import type { KuzuClient } from './client.js'
import { resolveEntity, incrementMentionCount } from './entity-store.js'
import { extractStructured } from '../extractors/structured.js'
import type { FullMemory } from '../types.js'

// MEM-012: Allowed Cypher relationship types — enforced at write time.
const ALLOWED_EDGE_TYPES: ReadonlySet<string> = new Set(['MENTIONS', 'PRODUCED_IN'])

export async function upsertMemoryToKuzu(
  client: KuzuClient,
  memory: FullMemory,
  embedding: Float32Array | null
): Promise<void> {
  const now = new Date().toISOString()

  // Step 1: Upsert Memory node atomically — DELETE then CREATE inside a transaction
  // so a failure between the two never leaves the graph without the node.
  const embeddingArray = embedding ? Array.from(embedding) : null

  await client.withTransaction(async () => {
    await client.query(
      `MATCH (m:Memory {id: $id}) DETACH DELETE m`,
      { id: memory.memory_id }
    )
    await client.query(
      `CREATE (m:Memory {
        id: $id,
        workspace_id: $workspace_id,
        project_id: $project_id,
        kind: $kind,
        scope: $scope,
        title: $title,
        summary: $summary,
        importance: $importance,
        freshness: $freshness,
        confidence: $confidence,
        created_at: CAST($created_at AS TIMESTAMP),
        updated_at: CAST($updated_at AS TIMESTAMP),
        embedding: $embedding
      })`,
      {
        id: memory.memory_id,
        workspace_id: memory.workspace_id,
        project_id: memory.project_id ?? '',
        kind: memory.kind,
        scope: memory.scope,
        title: memory.title,
        summary: memory.summary,
        importance: memory.importance,
        freshness: memory.freshness,
        confidence: memory.confidence,
        created_at: memory.created_at,
        updated_at: memory.updated_at,
        embedding: embeddingArray ?? new Array(client.dims).fill(0), // MEM-002
      }
    )
  })

  // Step 2: Run structured extraction on content
  const bodyText = memory.canonical_text ?? memory.title
  const mentions = extractStructured(bodyText, {
    task_id: memory.task_id,
    run_id: null,
  })

  // Step 3: For each mention, resolve entity and create edge
  for (const mention of mentions) {
    const entity = await resolveEntity(client, mention.raw, memory.workspace_id)
    await incrementMentionCount(client, entity.id)

    const edgeTable = mention.edgeType
    // MEM-012: reject any edge type not in the allow-list before using in Cypher
    if (!ALLOWED_EDGE_TYPES.has(edgeTable)) continue
    const weight = mention.confidence

    if (edgeTable === 'PRODUCED_IN') {
      await client.query(
        `MATCH (m:Memory {id: $mid}), (e:Entity {id: $eid})
         CREATE (m)-[:PRODUCED_IN {weight: $weight, source: 'rule', created_at: CAST($now AS TIMESTAMP)}]->(e)`,
        { mid: memory.memory_id, eid: entity.id, weight, now }
      ).catch((err: Error) => {
        process.stderr.write(`[kuzu/upsert] PRODUCED_IN edge failed mem=${memory.memory_id} entity=${entity.id}: ${err.message}\n`)
      })
    } else {
      await client.query(
        `MATCH (m:Memory {id: $mid}), (e:Entity {id: $eid})
         CREATE (m)-[:MENTIONS {weight: $weight, confidence: $confidence, source: 'rule', created_at: CAST($now AS TIMESTAMP)}]->(e)`,
        { mid: memory.memory_id, eid: entity.id, weight, confidence: mention.confidence, now }
      ).catch((err: Error) => {
        process.stderr.write(`[kuzu/upsert] MENTIONS edge failed mem=${memory.memory_id} entity=${entity.id}: ${err.message}\n`)
      })
    }
  }
}

export async function removeMemoryFromKuzu(
  client: KuzuClient,
  memoryId: string
): Promise<void> {
  // DETACH DELETE removes the node and all incident edges
  await client.query(
    `MATCH (m:Memory {id: $id}) DETACH DELETE m`,
    { id: memoryId }
  )
}
