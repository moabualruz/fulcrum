// v2a PR 7 Task 38 — Kuzu reducer for memory writes.
//
// Projects EDITS / ABOUT_FILE / ABOUT_SYMBOL / MENTIONS_SYMBOL edges from
// memory rows. Runs async after L1 insert per L0→L1→L2 ordering invariant.
//
//   kind='file_patch'       → EDITS edge from Memory to each file_paths[i]
//   kind='decision' / prose → parse [[symbol:X]] and [[file:Y]] wikilinks →
//                             ABOUT_FILE / ABOUT_SYMBOL / MENTIONS_SYMBOL edges

import type { Db } from 'fulcrum-core'
import { getKuzuClient, type KuzuClient } from '../client.js'

const WIKILINK_RE = /\[\[(file|symbol):([^\]]+)\]\]/g

export interface MemoryReducerInput {
  memoryId: string
  workspaceId: string
  projectId: string | null
  kind: string
  content: string
  filePaths?: string[]
}

/**
 * Project a memory-write event onto the graph. Runs asynchronously —
 * errors are logged and never block the L1 write.
 */
export async function reduceMemoryWrite(db: Db, input: MemoryReducerInput): Promise<'ok' | 'no-kuzu' | 'error'> {
  const client = getKuzuClient()
  if (!client) return 'no-kuzu'

  try {
    if (input.kind === 'file_patch' && input.filePaths && input.filePaths.length > 0) {
      await writeEditsEdges(client, db, input)
    }
    await writeWikilinkEdges(client, db, input)
    return 'ok'
  } catch (err) {
    process.stderr.write(`[kuzu-reducer:memory] ${input.memoryId}: ${err instanceof Error ? err.message : String(err)}\n`)
    return 'error'
  }
}

async function writeEditsEdges(
  client: KuzuClient,
  db: Db,
  input: MemoryReducerInput,
): Promise<void> {
  if (!input.projectId) return
  for (const filePath of input.filePaths ?? []) {
    const row = db.prepare('SELECT file_id FROM code_files WHERE project_id = ? AND rel_path = ?').get(input.projectId, filePath) as { file_id: string } | undefined
    if (!row) continue
    await client.query(
      `MATCH (m:Memory {id: $mid}), (f:File {file_id: $fid})
       CREATE (m)-[:EDITS {weight: 1.0, source: 'memory-write', created_at: CAST($now AS TIMESTAMP)}]->(f)`,
      { mid: input.memoryId, fid: row.file_id, now: new Date().toISOString() },
    ).catch(() => { /* edge may already exist or nodes not yet committed */ })
  }
}

async function writeWikilinkEdges(
  client: KuzuClient,
  db: Db,
  input: MemoryReducerInput,
): Promise<void> {
  if (!input.projectId) return
  const matches = Array.from(input.content.matchAll(WIKILINK_RE))
  for (const match of matches) {
    const [, kind, raw] = match
    const value = (raw ?? '').trim()
    if (!value || !kind) continue
    if (kind === 'file') {
      const row = db.prepare('SELECT file_id FROM code_files WHERE project_id = ? AND rel_path = ?').get(input.projectId, value) as { file_id: string } | undefined
      if (!row) continue
      await client.query(
        `MATCH (m:Memory {id: $mid}), (f:File {file_id: $fid})
         CREATE (m)-[:ABOUT_FILE {weight: 0.8, confidence: 0.9, source: 'wikilink', created_at: CAST($now AS TIMESTAMP)}]->(f)`,
        { mid: input.memoryId, fid: row.file_id, now: new Date().toISOString() },
      ).catch(() => { /* already exists or nodes missing */ })
    } else if (kind === 'symbol') {
      // Resolve symbol by name — may match multiple; emit both ABOUT_SYMBOL
      // (strong claim) and MENTIONS_SYMBOL (weak) so downstream consumers
      // decide the precedence.
      const rows = db.prepare('SELECT file_id, name, line FROM code_symbols WHERE name = ? LIMIT 10').all(value) as Array<{ file_id: string; name: string; line: number }>
      for (const row of rows) {
        const symbolId = `${row.file_id}:${row.name}:${row.line}`
        await client.query(
          `MATCH (m:Memory {id: $mid}), (s:Symbol {symbol_id: $sid})
           CREATE (m)-[:ABOUT_SYMBOL {weight: 0.7, confidence: 0.8, source: 'wikilink', created_at: CAST($now AS TIMESTAMP)}]->(s)`,
          { mid: input.memoryId, sid: symbolId, now: new Date().toISOString() },
        ).catch(() => { /* already exists */ })
        await client.query(
          `MATCH (m:Memory {id: $mid}), (s:Symbol {symbol_id: $sid})
           CREATE (m)-[:MENTIONS_SYMBOL {weight: 0.4, confidence: 0.6, source: 'wikilink', created_at: CAST($now AS TIMESTAMP)}]->(s)`,
          { mid: input.memoryId, sid: symbolId, now: new Date().toISOString() },
        ).catch(() => { /* already exists */ })
      }
    }
  }
}

export function extractWikilinkRefs(content: string): Array<{ kind: 'file' | 'symbol'; value: string }> {
  const result: Array<{ kind: 'file' | 'symbol'; value: string }> = []
  for (const m of content.matchAll(WIKILINK_RE)) {
    const [, kind, raw] = m
    if (kind === 'file' || kind === 'symbol') {
      const value = (raw ?? '').trim()
      if (value) result.push({ kind, value })
    }
  }
  return result
}
