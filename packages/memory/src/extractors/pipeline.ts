// packages/memory/src/extractors/pipeline.ts
// Orchestrates Track 1 (sync) + Track 2 (async) extraction
// and manages the .queue/l2-pending.jsonl queue file.

import { appendFileSync } from 'fs'
import { join, extname } from 'path'
import { getKuzuClient } from '../kuzu/client.js'
import { upsertMemoryToKuzu } from '../kuzu/upsert.js'
import { resolveEntity, incrementMentionCount } from '../kuzu/entity-store.js'
import { extractSemantic } from './semantic.js'
import { parseLocalImports } from '../import-parser.js'
import type { FullMemory } from '../types.js'

const TS_JS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx'])

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

  // Track 1b (GAP-RAG-4): emit structural USES edges from import declarations.
  // Parses `import ... from`, `require()`, `export ... from` in TS/JS files and
  // creates USES edges from the Memory node to Entity nodes for each local import.
  // Only runs for TypeScript/JavaScript source files.
  if (memory.file_path && TS_JS_EXTS.has(extname(memory.file_path).toLowerCase())) {
    const chunkText = memory.canonical_text ?? ''
    const importPaths = parseLocalImports(chunkText)
    const now = new Date().toISOString()
    for (const importPath of importPaths) {
      try {
        // Force entity type 'file' by using wikilink syntax [[file/<path>]]
        const entity = await resolveEntity(kuzuClient, `[[file/${importPath}]]`, memory.workspace_id)
        await incrementMentionCount(kuzuClient, entity.id)
        await kuzuClient.query(
          `MATCH (m:Memory {id: $mid}), (e:Entity {id: $eid})
           CREATE (m)-[:USES {weight: 1.0, confidence: 1.0, source: 'import', created_at: CAST($now AS TIMESTAMP)}]->(e)`,
          { mid: memory.memory_id, eid: entity.id, now }
        ).catch(() => { /* edge or nodes may not exist yet — non-fatal */ })
      } catch {
        // Entity resolution failed — skip this import, don't fail the whole pipeline
      }
    }
  }

  // Track 2: LLM semantic extraction — curated kinds only
  const TRACK2_KINDS = new Set(['decision', 'fact', 'lesson', 'error', 'task_outcome'])
  if (TRACK2_KINDS.has(memory.kind)) {
    // Enqueue for async processing
    enqueueForL2(vaultPath, memory.memory_id, memory.workspace_id)

    // Run semantic extraction inline if API key is available
    const bodyText = memory.canonical_text ?? memory.title
    if (process.env.ANTHROPIC_API_KEY && bodyText.length > 50) {
      try {
        const edges = await extractSemantic(memory.memory_id, bodyText, memory.workspace_id)
        const now = new Date().toISOString()

        for (const edge of edges) {
          // CAUSES and PREVENTS are Entity→Entity in schema — skip graph write for those
          if (edge.edgeType === 'CAUSES' || edge.edgeType === 'PREVENTS') continue

          try {
            const entity = await resolveEntity(kuzuClient, edge.toEntityId, memory.workspace_id)
            await incrementMentionCount(kuzuClient, entity.id)

            await kuzuClient.query(
              `MATCH (m:Memory {id: $mid}), (e:Entity {id: $eid})
               CREATE (m)-[:${edge.edgeType} {weight: $weight, confidence: $confidence, source: 'llm', created_at: CAST($now AS TIMESTAMP)}]->(e)`,
              {
                mid: memory.memory_id,
                eid: entity.id,
                weight: edge.confidence,
                confidence: edge.confidence,
                now,
              }
            ).catch(() => { /* edge may already exist */ })
          } catch {
            // Entity resolution or graph write failed — continue with next edge
          }
        }
      } catch {
        // Semantic extraction failed — continue without graph population
      }
    }
  }
}
