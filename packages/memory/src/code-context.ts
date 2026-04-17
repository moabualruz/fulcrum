// v2b PR 13 Task 4.1 — code_context action.
//
// Traverses Kuzu from a seed code node (symbol or file) returning callers,
// callees, imports, nearest-neighbor chunks, and reachable memories via
// about/mentions/edits edges. Gracefully degrades when Kuzu is not ready.
//
// Fix #28: Memory results are fused over three separate graph paths (ABOUT,
// MENTIONS, EDITS) using RRF (k=60) so memories appearing on multiple paths
// rank higher than single-path results.

import { getDb, type Db } from 'fulcrum-agent-core'
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

const RRF_K = 60

export function rrfFuse(
  pathResults: Array<Array<{ id: string; data: unknown }>>,
): Array<{ id: string; data: unknown; score: number }> {
  const scoreMap = new Map<string, number>()
  const dataMap = new Map<string, unknown>()

  for (const pathRows of pathResults) {
    pathRows.forEach((row, idx) => {
      const rank = idx + 1
      const contribution = 1 / (RRF_K + rank)
      scoreMap.set(row.id, (scoreMap.get(row.id) ?? 0) + contribution)
      if (!dataMap.has(row.id)) dataMap.set(row.id, row.data)
    })
  }

  return [...scoreMap.entries()]
    .map(([id, score]) => ({ id, data: dataMap.get(id)!, score }))
    .sort((a, b) => b.score - a.score)
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

    // Memory traversal: run ABOUT, MENTIONS, EDITS as separate paths, then fuse via RRF.
    // Each relationship is queried across Symbol, File, and CodeChunk node types with
    // three individual queries rather than multi-label syntax — Kuzu's |‐label shorthand
    // is version-dependent and a parse failure would silently return empty via the
    // try/catch, making the entire RRF fusion a silent no-op.
    const seedId = input.symbol ?? input.file
    if (seedId) {
      const NODE_LABELS = ['Symbol', 'File', 'CodeChunk'] as const
      const EDGE_RELS = ['ABOUT', 'MENTIONS', 'EDITS'] as const

      const fetchSingle = async (
        rel: string,
        label: string,
      ): Promise<Array<{ id: string; data: unknown }>> => {
        try {
          const rows = await kuzuClient.query<Record<string, unknown>>(
            `MATCH (m:Memory)-[:${rel}]->(n:${label} {name: $name}) RETURN m LIMIT $limit`,
            { name: seedId, limit },
          )
          const out: Array<{ id: string; data: unknown }> = []
          for (const r of rows) {
            const mem = (r['m'] ?? r) as Record<string, unknown>
            const id = (mem['memory_id'] ?? mem['id']) as string | undefined
            if (id) out.push({ id, data: mem })
          }
          return out
        } catch {
          return []
        }
      }

      // 9 queries (3 rels × 3 labels) run in parallel; results per rel are merged
      // before RRF so rank position stays per-relationship.
      const relResults = await Promise.all(
        EDGE_RELS.map(async rel => {
          const labelRows = await Promise.all(NODE_LABELS.map(lbl => fetchSingle(rel, lbl)))
          // Deduplicate across labels within this rel, preserving first-seen order.
          const seen = new Set<string>()
          const merged: Array<{ id: string; data: unknown }> = []
          for (const rows of labelRows) {
            for (const row of rows) {
              if (!seen.has(row.id)) {
                seen.add(row.id)
                merged.push(row)
              }
            }
          }
          return merged
        }),
      )

      const fused = rrfFuse(relResults)
      result.memories = fused.slice(0, limit).map(r => r.data)
    }
  } catch {
    // Kuzu query error — return partial result with empty groups
  }

  return result
}
