// v2b PR 13 Task 4.1 — code_context action.
//
// Traverses Kuzu from a seed code node (symbol or file) returning callers,
// callees, imports, nearest-neighbor chunks, and reachable memories via
// about/mentions/edits edges. Gracefully degrades when Kuzu is not ready.

import { getDb, type Db } from 'fulcrum-core'
import { getKuzuClient } from './kuzu/client.js'

export interface CodeContextInput {
  symbol?: string
  file?: string
  workspace_id: string
  project_id?: string | null
  limit?: number
  scope?: string
}

export interface CodeContextResult {
  seed: { symbol?: string; file?: string } | null
  callers: unknown[]
  callees: unknown[]
  imports: unknown[]
  chunks: unknown[]
  memories: unknown[]
}

export async function runCodeContext(
  input: CodeContextInput,
  db: Db = getDb()
): Promise<CodeContextResult> {
  const limit = input.limit ?? 10
  const kuzuClient = getKuzuClient()

  // Base result — always returned; filled from Kuzu if ready
  const result: CodeContextResult = {
    seed: input.symbol ? { symbol: input.symbol } : input.file ? { file: input.file } : null,
    callers: [],
    callees: [],
    imports: [],
    chunks: [],
    memories: [],
  }

  if (!kuzuClient?.isReady) {
    // Graceful degradation: Kuzu not ready — fall back to SQLite for memories
    result.memories = db.prepare(`
      SELECT m.memory_id, m.title, m.summary, m.kind
      FROM memories m
      WHERE m.workspace_id = ?
      LIMIT ?
    `).all(input.workspace_id, limit)
    return result
  }

  try {
    // Symbol-based traversal
    if (input.symbol) {
      const callers = await kuzuClient.query<Record<string, unknown>>(
        `MATCH (s:Symbol {name: $name})<-[:CALLS]-(caller:Symbol) RETURN caller LIMIT $limit`,
        { name: input.symbol, limit }
      )
      result.callers = callers

      const callees = await kuzuClient.query<Record<string, unknown>>(
        `MATCH (s:Symbol {name: $name})-[:CALLS]->(callee:Symbol) RETURN callee LIMIT $limit`,
        { name: input.symbol, limit }
      )
      result.callees = callees
    }

    // File-based traversal
    if (input.file) {
      const chunks = await kuzuClient.query<Record<string, unknown>>(
        `MATCH (f:File {path: $path})<-[:ABOUT_FILE]-(c:CodeChunk) RETURN c LIMIT $limit`,
        { path: input.file, limit }
      )
      result.chunks = chunks

      const imports = await kuzuClient.query<Record<string, unknown>>(
        `MATCH (f:File {path: $path})-[:IMPORTS]->(imported:File) RETURN imported LIMIT $limit`,
        { path: input.file, limit }
      )
      result.imports = imports
    }

    // Memory traversal via about/mentions/edits edges
    const seedId = input.symbol ?? input.file
    if (seedId) {
      const memories = await kuzuClient.query<Record<string, unknown>>(
        `MATCH (m:Memory)-[:ABOUT|MENTIONS|EDITS]->(:Symbol|File|CodeChunk {name: $name}) RETURN m LIMIT $limit`,
        { name: seedId, limit }
      )
      result.memories = memories
    }
  } catch {
    // Kuzu query error — return partial result with empty groups
  }

  return result
}
