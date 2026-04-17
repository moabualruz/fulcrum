// packages/memory/src/ingest.ts
import { ulid } from 'ulidx'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, extname, basename } from 'path'
import { getDb, Db} from 'fulcrum-core'
import { contentHash, isDuplicate } from './dedup.js'
import { writeMemory } from './write.js'
import type { IngestFileInput, IngestResult, IngestProjectInput } from './types.js'
import { createASTChunker } from './chunkers/ast-chunker.js'
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
const MAX_CHUNK_CHARS = 1600  // ~400 tokens at ~4 chars/token
// NOTE(MEM-013): PROSE_OVERLAP is measured in characters, not tokens.
// At ~4 chars/token this gives ~50 tokens of overlap, matching the prose overlap target.
// A full tokenizer is not used to avoid adding a dependency.
const PROSE_OVERLAP = 200  // ~50 tokens × 4 chars/token

// Regex-based syntax chunker: splits at top-level function/class/arrow-function boundaries
const SYNTAX_BOUNDARIES = /(?=^(?:export\s+)?(?:async\s+)?(?:function|class)\s+\w)/gm

function chunkSyntax(content: string): { text: string; symbolPath: string | null; startLine: number; endLine: number }[] {
  const parts = content.split(SYNTAX_BOUNDARIES).filter(p => p.trim())
  const lines = content.split('\n')
  const chunks: { text: string; symbolPath: string | null; startLine: number; endLine: number }[] = []

  let lineOffset = 0
  for (const part of parts) {
    const partLines = part.split('\n')
    const startLine = lineOffset + 1
    const endLine = lineOffset + partLines.length

    // Extract symbol name from function/class declaration
    const match = part.match(/(?:export\s+)?(?:async\s+)?(?:function|class)\s+(\w+)/)
    const symbolPath = match ? match[1] : null

    // If chunk exceeds max size, split by lines
    if (part.length > MAX_CHUNK_CHARS) {
      const subChunks = splitByMaxSize(part, MAX_CHUNK_CHARS, 0)
      let subLine = startLine
      for (const sub of subChunks) {
        const subLines = sub.split('\n').length
        chunks.push({ text: sub, symbolPath, startLine: subLine, endLine: subLine + subLines - 1 })
        subLine += subLines
      }
    } else {
      chunks.push({ text: part.trim(), symbolPath, startLine, endLine })
    }

    lineOffset += partLines.length
  }

  // Fallback: if no splits found, treat whole file as one chunk
  if (chunks.length === 0 && content.trim()) {
    const totalLines = lines.length
    if (content.length > MAX_CHUNK_CHARS) {
      const subChunks = splitByMaxSize(content, MAX_CHUNK_CHARS, 0)
      let ln = 1
      for (const sub of subChunks) {
        const subLines = sub.split('\n').length
        chunks.push({ text: sub, symbolPath: null, startLine: ln, endLine: ln + subLines - 1 })
        ln += subLines
      }
    } else {
      chunks.push({ text: content.trim(), symbolPath: null, startLine: 1, endLine: totalLines })
    }
  }

  return chunks
}

function chunkSemantic(content: string): { text: string; symbolPath: string | null; startLine: number; endLine: number }[] {
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim())
  const chunks: { text: string; symbolPath: string | null; startLine: number; endLine: number }[] = []
  let lineOffset = 1
  for (const para of paragraphs) {
    const paraLines = para.split('\n').length
    const text = para.trim()
    if (text.length > MAX_CHUNK_CHARS) {
      const subChunks = splitByMaxSize(text, MAX_CHUNK_CHARS, PROSE_OVERLAP)
      let ln = lineOffset
      for (const sub of subChunks) {
        const subLines = sub.split('\n').length
        chunks.push({ text: sub, symbolPath: null, startLine: ln, endLine: ln + subLines - 1 })
        ln += subLines
      }
    } else {
      chunks.push({ text, symbolPath: null, startLine: lineOffset, endLine: lineOffset + paraLines - 1 })
    }
    lineOffset += paraLines + 1  // +1 for blank line separator
  }
  return chunks
}

function splitByMaxSize(text: string, maxChars: number, overlap: number): string[] {
  const result: string[] = []
  let start = 0
  while (start < text.length) {
    const end = start + maxChars
    result.push(text.slice(start, end))
    start = end - overlap
    if (start >= text.length) break
  }
  return result
}

// NOTE: tree-sitter reports offsets in bytes (UTF-8), but JavaScript strings
// are UTF-16. For ASCII-only source files these are identical. Files containing
// multi-byte characters (e.g. CJK literals, emoji in comments) will produce
// slightly inaccurate line numbers because we index by JS code-unit position
// rather than raw byte position. This is acceptable for chunk attribution
// purposes — the chunk text itself is correct; only the reported line number
// may be off by at most one line per multi-byte character encountered before
// the split boundary.

/** Build a sorted array of character (code-unit) offsets where each line begins. */
function buildLineStartIndex(source: string): number[] {
  const starts = [0]
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') starts.push(i + 1)
  }
  return starts
}

/** Convert a zero-based character offset to a 1-based line number. */
function byteOffsetToLine(offset: number, lineStarts: number[]): number {
  let lo = 0, hi = lineStarts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (lineStarts[mid] <= offset) lo = mid
    else hi = mid - 1
  }
  return lo + 1  // 1-based
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

  const lang = language?.toLowerCase()
  const isSyntax = lang !== undefined && CODE_LANGUAGES.has(lang)
  const chunkStrategy = isSyntax ? 'syntax' : 'semantic'
  const sourceType = isSyntax ? 'code' : 'prose'
  const memoryKind = isSyntax ? 'symbol' : 'doc'

  // AST-based chunking for supported languages (ts/tsx/js/jsx).
  // Falls back to regex-based chunkSyntax() if web-tree-sitter is unavailable.
  const AST_SUPPORTED = new Set(['typescript', 'javascript'])
  let rawChunks: { text: string; symbolPath: string | null; startLine: number; endLine: number }[]
  if (isSyntax && lang !== undefined && AST_SUPPORTED.has(lang)) {
    const astChunker = await createASTChunker()
    if (astChunker) {
      const astChunks = astChunker.chunkWithLanguage(content, lang)
      const lineStarts = buildLineStartIndex(content)
      rawChunks = astChunks.map(c => ({
        text: c.text,
        symbolPath: c.name ?? null,
        startLine: byteOffsetToLine(c.start, lineStarts),
        endLine: byteOffsetToLine(c.end - 1, lineStarts),
      }))
    } else {
      rawChunks = chunkSyntax(content)
    }
  } else {
    rawChunks = isSyntax ? chunkSyntax(content) : chunkSemantic(content)
  }

  let chunks_created = 0
  let memories_created = 0

  for (const chunk of rawChunks) {
    const hash = contentHash(chunk.text)
    const symbolPath: string | null = 'symbolPath' in chunk ? (chunk.symbolPath as string | null) : null

    // Dedup check for code_chunks
    const existingChunk = db.prepare(
      'SELECT chunk_id FROM code_chunks WHERE project_id = ? AND file_path = ? AND content_hash = ? LIMIT 1'
    ).get(project_id, file_path, hash) as { chunk_id: string } | undefined

    if (!existingChunk) {
      const chunk_id = ulid()
      const now = new Date().toISOString()
      db.prepare(`
        INSERT INTO code_chunks (
          chunk_id, workspace_id, project_id, file_path, language,
          chunk_strategy, source_type, content,
          start_line, end_line, symbol_path, content_hash, indexed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        chunk_id, workspace_id, project_id, file_path, lang ?? null,
        chunkStrategy, sourceType, chunk.text,
        chunk.startLine, chunk.endLine, symbolPath, hash, now
      )
      chunks_created++
    }

    // Write a Memory for each new chunk (dedup handled inside writeMemory)
    const title = symbolPath
      ? `${basename(file_path)}: ${symbolPath}`
      : `${basename(file_path)} (lines ${chunk.startLine}–${chunk.endLine})`

    const existingMemId = isDuplicate({ db, workspace_id, project_id, hash })
    if (!existingMemId) {
      const mem = await writeMemory({
        workspace_id, project_id,
        scope: 'file',
        kind: memoryKind as 'symbol' | 'doc',
        title,
        summary: chunk.text.slice(0, 200).replace(/\n/g, ' '),
        content: chunk.text,
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
            const importPaths = extractImports(chunk.text, lang)
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

  return { chunks_created, memories_created }
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
