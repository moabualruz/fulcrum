// packages/memory/src/extractors/pipeline.ts
// Orchestrates Track 1 (sync) + Track 2 (async) extraction
// and manages the .queue/l2-pending.jsonl queue file.

import { appendFileSync } from 'fs'
import { join } from 'path'
import { extractStructured } from './structured.js'
import { getKuzuClient } from '../kuzu/client.js'
import { resolveEntity, incrementMentionCount } from '../kuzu/entity-store.js'
import type { FullMemory } from '../types.js'

export interface PendingL2Item {
  memory_id: string
  workspace_id: string
  enqueued_at: string
}

export function enqueueForL2(vaultPath: string, memoryId: string, workspaceId: string): void {
  const queuePath = join(vaultPath, '.queue', 'l2-pending.jsonl')
  const item: PendingL2Item = {
    memory_id: memoryId,
    workspace_id: workspaceId,
    enqueued_at: new Date().toISOString(),
  }
  appendFileSync(queuePath, JSON.stringify(item) + '\n', 'utf-8')
}

/**
 * Run the full extraction pipeline for a memory:
 * - Track 1 (sync): structured extraction → MENTIONS + PRODUCED_IN edges
 * - Track 2 (async): enqueue for LLM extraction if L2 is active
 */
export async function runExtractionPipeline(
  vaultPath: string,
  memory: FullMemory
): Promise<void> {
  const kuzuClient = getKuzuClient()
  if (!kuzuClient?.isReady) return

  const bodyText = memory.canonical_text ?? memory.title
  const mentions = extractStructured(bodyText, {
    task_id: memory.task_id,
    run_id: null,
  })

  const now = new Date().toISOString()

  for (const mention of mentions) {
    const entity = await resolveEntity(kuzuClient, mention.raw, memory.workspace_id)
    await incrementMentionCount(kuzuClient, entity.id)

    if (mention.edgeType === 'PRODUCED_IN') {
      await kuzuClient.query(
        `MATCH (m:Memory {id: $mid}), (e:Entity {id: $eid})
         CREATE (m)-[:PRODUCED_IN {weight: $weight, source: 'rule', created_at: CAST($now AS TIMESTAMP)}]->(e)`,
        { mid: memory.memory_id, eid: entity.id, weight: mention.confidence, now }
      ).catch(() => {})
    } else {
      await kuzuClient.query(
        `MATCH (m:Memory {id: $mid}), (e:Entity {id: $eid})
         CREATE (m)-[:MENTIONS {weight: $weight, confidence: $conf, source: 'rule', created_at: CAST($now AS TIMESTAMP)}]->(e)`,
        { mid: memory.memory_id, eid: entity.id, weight: mention.confidence, conf: mention.confidence, now }
      ).catch(() => {})
    }
  }

  // Enqueue for LLM semantic extraction (Track 2)
  enqueueForL2(vaultPath, memory.memory_id, memory.workspace_id)
}
