// packages/memory/src/extractors/pipeline.ts
// Orchestrates Track 1 (sync) + Track 2 (async) extraction
// and manages the .queue/l2-pending.jsonl queue file.

import { appendFileSync } from 'fs'
import { join } from 'path'
import { getKuzuClient } from '../kuzu/client.js'
import { upsertMemoryToKuzu } from '../kuzu/upsert.js'
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
 * - Track 1 (sync): upsert Memory node into Kuzu + entity extraction → edges
 * - Track 2 (async): enqueue for LLM extraction if L2 is active
 *
 * Guard: if KuzuClient is not ready, returns immediately (no-op).
 */
export async function runExtractionPipeline(
  vaultPath: string,
  memory: FullMemory
): Promise<void> {
  const kuzuClient = getKuzuClient()
  if (!kuzuClient?.isReady) return

  // Track 1: create/update Memory node + entity edges in Kuzu
  await upsertMemoryToKuzu(kuzuClient, memory, null)

  // Track 2: enqueue for LLM semantic extraction — curated kinds only
  const TRACK2_KINDS = new Set(['decision', 'fact', 'lesson', 'error', 'task_outcome'])
  if (TRACK2_KINDS.has(memory.kind)) {
    enqueueForL2(vaultPath, memory.memory_id, memory.workspace_id)
  }
}
