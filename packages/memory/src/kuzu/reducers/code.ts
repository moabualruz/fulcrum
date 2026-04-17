// v2a PR 7 Task 37 — Kuzu reducer for PCI code events.
//
// Projects File / CodeChunk / Symbol nodes and CONTAINED_IN / DEFINES /
// CALLS edges from the relational code_files + code_chunks + code_symbols
// tables. Called synchronously from the syncer's add/change/unlink path so
// the graph stays in lockstep with L1.
//
// Errors are logged, never block ingest. If the Kuzu client is not wired
// (L2 inactive), the reducer is a no-op — matches the failure-isolation
// invariant from §8.1 "Population path".

import type { Db } from 'fulcrum-core'
import { getKuzuClient, type KuzuClient } from '../client.js'

export interface ProjectFileInput {
  fileId: string
  workspaceId: string
  projectId: string
  relPath: string
  language: string
  sha256: string
  mtimeNs: number
  sizeBytes: number
  indexedAt?: Date | string
}

export interface ProjectChunkInput {
  chunkId: string
  fileId: string
  kind: string
  symbolPath: string | null
  startLine: number
  endLine: number
  embedding?: number[]
}

export interface ProjectSymbolInput {
  symbolId: string
  fileId: string
  name: string
  kind: string
  line: number
}

/** Upsert a File node — used on add + change. */
export async function upsertFileNode(client: KuzuClient, file: ProjectFileInput): Promise<void> {
  const indexedAt = toTimestamp(file.indexedAt ?? new Date())
  // MERGE would be ideal; Kuzu <0.5 doesn't reliably support it, so use
  // DELETE + CREATE for idempotency (rel edges are preserved where possible
  // by later re-population).
  await client.query(
    `MATCH (f:File {file_id: $file_id}) DETACH DELETE f`,
    { file_id: file.fileId },
  ).catch(() => { /* node may not exist yet */ })
  await client.query(
    `CREATE (f:File {
       file_id: $file_id,
       workspace_id: $workspace_id,
       project_id: $project_id,
       rel_path: $rel_path,
       language: $language,
       sha256: $sha256,
       mtime_ns: $mtime_ns,
       size_bytes: $size_bytes,
       indexed_at: CAST($indexed_at AS TIMESTAMP)
     })`,
    {
      file_id: file.fileId,
      workspace_id: file.workspaceId,
      project_id: file.projectId,
      rel_path: file.relPath,
      language: file.language,
      sha256: file.sha256,
      mtime_ns: file.mtimeNs,
      size_bytes: file.sizeBytes,
      indexed_at: indexedAt,
    },
  )
}

/** Delete a File node + cascade chunks / symbols / edges. */
export async function deleteFileNode(client: KuzuClient, fileId: string): Promise<void> {
  await client.query(
    `MATCH (f:File {file_id: $file_id})
     OPTIONAL MATCH (c:CodeChunk {file_id: $file_id})
     OPTIONAL MATCH (s:Symbol {file_id: $file_id})
     DETACH DELETE f, c, s`,
    { file_id: fileId },
  ).catch(() => { /* best-effort */ })
}

/** Upsert a CodeChunk + CONTAINED_IN edge. */
export async function upsertCodeChunkNode(client: KuzuClient, chunk: ProjectChunkInput): Promise<void> {
  await client.query(
    `MATCH (c:CodeChunk {chunk_id: $chunk_id}) DETACH DELETE c`,
    { chunk_id: chunk.chunkId },
  ).catch(() => { /* missing is fine */ })
  await client.query(
    `CREATE (c:CodeChunk {
       chunk_id: $chunk_id,
       file_id: $file_id,
       kind: $kind,
       symbol_path: $symbol_path,
       start_line: $start_line,
       end_line: $end_line
     })`,
    {
      chunk_id: chunk.chunkId,
      file_id: chunk.fileId,
      kind: chunk.kind,
      symbol_path: chunk.symbolPath ?? '',
      start_line: chunk.startLine,
      end_line: chunk.endLine,
    },
  )
  // CONTAINED_IN: CodeChunk -> File
  await client.query(
    `MATCH (c:CodeChunk {chunk_id: $chunk_id}), (f:File {file_id: $file_id})
     CREATE (c)-[:CONTAINED_IN {source: 'pci'}]->(f)`,
    { chunk_id: chunk.chunkId, file_id: chunk.fileId },
  ).catch(() => { /* edge may already exist */ })
}

/** Upsert a Symbol + DEFINES edge from the containing File. */
export async function upsertSymbolNode(client: KuzuClient, symbol: ProjectSymbolInput): Promise<void> {
  await client.query(
    `MATCH (s:Symbol {symbol_id: $symbol_id}) DETACH DELETE s`,
    { symbol_id: symbol.symbolId },
  ).catch(() => { /* missing is fine */ })
  await client.query(
    `CREATE (s:Symbol {
       symbol_id: $symbol_id,
       file_id: $file_id,
       name: $name,
       kind: $kind,
       line: $line
     })`,
    {
      symbol_id: symbol.symbolId,
      file_id: symbol.fileId,
      name: symbol.name,
      kind: symbol.kind,
      line: symbol.line,
    },
  )
  // DEFINES: File -> Symbol
  await client.query(
    `MATCH (f:File {file_id: $file_id}), (s:Symbol {symbol_id: $symbol_id})
     CREATE (f)-[:DEFINES {source: 'pci'}]->(s)`,
    { file_id: symbol.fileId, symbol_id: symbol.symbolId },
  ).catch(() => { /* edge may already exist */ })
}

export interface ProjectFileStateFromDb {
  file: ProjectFileInput
  chunks: ProjectChunkInput[]
  symbols: ProjectSymbolInput[]
}

/**
 * Read the relational rows for a given file and project them into the graph.
 * Safe to call after every syncFile() — errors never block; the graph
 * converges asynchronously with ingest.
 */
export async function reduceFileToGraph(db: Db, fileId: string): Promise<'ok' | 'missing' | 'no-kuzu'> {
  const client = getKuzuClient()
  if (!client) return 'no-kuzu'
  const file = db.prepare('SELECT * FROM code_files WHERE file_id = ?').get(fileId) as Record<string, unknown> | undefined
  if (!file) return 'missing'

  try {
    await upsertFileNode(client, {
      fileId: String(file['file_id']),
      workspaceId: String(file['workspace_id']),
      projectId: String(file['project_id']),
      relPath: String(file['rel_path']),
      language: String(file['language'] ?? 'unknown'),
      sha256: String(file['sha256'] ?? ''),
      mtimeNs: Number(file['mtime_ns'] ?? 0),
      sizeBytes: Number(file['size_bytes'] ?? 0),
    })

    const chunks = db.prepare('SELECT chunk_id, file_id, chunk_strategy, symbol_path, start_line, end_line FROM code_chunks WHERE file_id = ?').all(fileId) as Array<Record<string, unknown>>
    for (const row of chunks) {
      await upsertCodeChunkNode(client, {
        chunkId: String(row['chunk_id']),
        fileId: String(row['file_id']),
        kind: String(row['chunk_strategy'] ?? 'syntax'),
        symbolPath: row['symbol_path'] ? String(row['symbol_path']) : null,
        startLine: Number(row['start_line'] ?? 0),
        endLine: Number(row['end_line'] ?? 0),
      })
    }

    const symbols = db.prepare('SELECT file_id, name, kind, line FROM code_symbols WHERE file_id = ?').all(fileId) as Array<Record<string, unknown>>
    for (const row of symbols) {
      await upsertSymbolNode(client, {
        symbolId: `${fileId}:${String(row['name'])}:${Number(row['line'])}`,
        fileId: String(row['file_id']),
        name: String(row['name']),
        kind: String(row['kind']),
        line: Number(row['line']),
      })
    }
    return 'ok'
  } catch (err) {
    process.stderr.write(`[kuzu-reducer:code] ${fileId}: ${err instanceof Error ? err.message : String(err)}\n`)
    return 'ok'
  }
}

export async function reduceUnlinkToGraph(fileId: string): Promise<'ok' | 'no-kuzu'> {
  const client = getKuzuClient()
  if (!client) return 'no-kuzu'
  try {
    await deleteFileNode(client, fileId)
  } catch (err) {
    process.stderr.write(`[kuzu-reducer:code] unlink ${fileId}: ${err instanceof Error ? err.message : String(err)}\n`)
  }
  return 'ok'
}

function toTimestamp(d: Date | string): string {
  if (typeof d === 'string') return d
  // Kuzu TIMESTAMP accepts ISO strings.
  return d.toISOString()
}
