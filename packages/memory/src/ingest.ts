// packages/memory/src/ingest.ts
import { readdirSync, readFileSync } from 'fs'
import { join, extname, basename } from 'path'
import { getDb, type Db } from 'fulcrum-agent-core'
import { contentHash, isDuplicate } from './dedup.js'
import { writeMemory } from './write.js'
import { indexCodeFile } from './l2/code.js'
import type { IngestFileInput, IngestResult, IngestProjectInput } from './types.js'
import { getKuzuClient } from './kuzu/client.js'
import { resolveEntity, incrementMentionCount } from './kuzu/entity-store.js'

const CODE_LANGUAGES = new Set(['typescript', 'javascript', 'python', 'java', 'go', 'rust', 'c', 'cpp'])
const LANG_EXT_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript',
  '.py': 'python',
  '.java': 'java',
  '.go': 'go',
  '.rs': 'rust',
  '.c': 'c',
  '.cpp': 'cpp', '.cc': 'cpp',
}

/**
 * Extract relative import paths from TypeScript/JavaScript source.
 * Returns only paths starting with './' or '../' — node_modules are excluded.
 */
export function extractImports(content: string, language: string): string[] {
  const lang = language.toLowerCase()
  if (lang !== 'typescript' && lang !== 'javascript') return []

  const paths: string[] = []

  // ES module static imports: import ... from '...' or import('...')
  const esImportRe = /(?:^|[\s;])import\s+(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]/gm
  let m: RegExpExecArray | null
  while ((m = esImportRe.exec(content)) !== null) {
    const p = m[1]!
    if (p.startsWith('./') || p.startsWith('../')) paths.push(p)
  }

  // require('...') calls
  const requireRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((m = requireRe.exec(content)) !== null) {
    const p = m[1]!
    if (p.startsWith('./') || p.startsWith('../')) paths.push(p)
  }

  // Deduplicate
  return [...new Set(paths)]
}

export async function ingestFile(input: IngestFileInput, db: Db = getDb()): Promise<IngestResult> {
  const { workspace_id, project_id, file_path, content, language } = input

  const indexResult = await indexCodeFile({
    workspace_id,
    project_id,
    rel_path: file_path,
    content,
    language,
  }, db)

  const lang = indexResult.language ?? undefined
  const isSyntax = lang !== undefined && CODE_LANGUAGES.has(lang)
  const memoryKind = isSyntax ? 'symbol' : 'doc'

  let memories_created = 0

  for (const chunk of indexResult.chunks) {
    const hash = contentHash(chunk.content)
    const symbolPath = chunk.symbol_path
    // Write a Memory for each new chunk (dedup handled inside writeMemory)
    const title = symbolPath
      ? `${basename(file_path)}: ${symbolPath}`
      : `${basename(file_path)} (lines ${chunk.start_line}–${chunk.end_line})`

    const existingMemId = isDuplicate({ db, workspace_id, project_id, hash })
    if (!existingMemId) {
      const mem = await writeMemory({
        workspace_id, project_id,
        scope: 'file',
        kind: memoryKind as 'symbol' | 'doc',
        title,
        summary: chunk.content.slice(0, 200).replace(/\n/g, ' '),
        content: chunk.content,
        file_path,
        symbol_path: symbolPath ?? undefined,
      })
      memories_created++

      // GAP-RAG-4: Emit USES edges from this Memory node to Entity nodes
      // representing files imported by this source file.
      if (lang === 'typescript' || lang === 'javascript') {
        const kuzuClient = getKuzuClient()
        if (kuzuClient) {
          try {
            const importPaths = extractImports(chunk.content, lang)
            const now = new Date().toISOString()
            for (const importPath of importPaths) {
              const entity = await resolveEntity(kuzuClient, `[[file/${importPath}]]`, workspace_id)
              await incrementMentionCount(kuzuClient, entity.id)
              await kuzuClient.query(
                `MATCH (m:Memory {id: $mid}), (e:Entity {id: $eid})
                 CREATE (m)-[:USES {weight: $weight, confidence: $confidence, source: 'import-graph', created_at: CAST($now AS TIMESTAMP)}]->(e)`,
                { mid: mem.memory_id, eid: entity.id, weight: 1.0, confidence: 1.0, now }
              ).catch(() => { /* edge may already exist or node not yet committed */ })
            }
          } catch (err) {
            process.stderr.write(`[ingestFile] graph USES write failed for ${file_path}: ${err instanceof Error ? err.message : String(err)}\n`)
          }
        }
      }
    }
  }

  return { chunks_created: indexResult.chunks_created, memories_created }
}

function walkDir(dir: string, extensions: Set<string>, depth = 0, maxDepth = 10): string[] {
  if (depth >= maxDepth) return []
  const result: string[] = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        // Skip node_modules and hidden dirs
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        result.push(...walkDir(full, extensions, depth + 1, maxDepth))
      } else if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) {
        result.push(full)
      }
    }
  } catch {
    // Ignore unreadable directories
  }
  return result
}

const INGEST_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.md'])

export async function ingestProject(input: IngestProjectInput): Promise<IngestResult & { errors: string[] }> {
  const { workspace_id, project_id, root_path } = input
  const files = walkDir(root_path, INGEST_EXTENSIONS)
  let total_chunks = 0
  let total_memories = 0
  const errors: string[] = []

  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, 'utf8')
      const ext = extname(filePath).toLowerCase()
      const language = LANG_EXT_MAP[ext]
      const relativePath = filePath.slice(root_path.length + 1)
      const result = await ingestFile({
        workspace_id, project_id,
        file_path: relativePath,
        content,
        language,
      })
      total_chunks += result.chunks_created
      total_memories += result.memories_created
    } catch (err) {
      const msg = `${filePath}: ${err instanceof Error ? err.message : String(err)}`
      errors.push(msg)
      console.warn(`[ingestProject] skipped file — ${msg}`)
    }
  }

  return { chunks_created: total_chunks, memories_created: total_memories, errors }
}
