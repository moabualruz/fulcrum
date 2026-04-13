// packages/memory/src/ingest.ts
import { ulid } from 'ulid'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, extname, basename } from 'path'
import { getDb } from '@fulcrum/core'
import { contentHash, isDuplicate } from './dedup.js'
import { writeMemory } from './write.js'
import type { IngestFileInput, IngestResult, IngestProjectInput } from './types.js'

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
const MAX_CHUNK_CHARS = 1600  // ~400 tokens
const PROSE_OVERLAP = 50

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

function chunkSemantic(content: string): { text: string; startLine: number; endLine: number }[] {
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim())
  const chunks: { text: string; startLine: number; endLine: number }[] = []
  let lineOffset = 1
  for (const para of paragraphs) {
    const paraLines = para.split('\n').length
    const text = para.trim()
    if (text.length > MAX_CHUNK_CHARS) {
      const subChunks = splitByMaxSize(text, MAX_CHUNK_CHARS, PROSE_OVERLAP)
      let ln = lineOffset
      for (const sub of subChunks) {
        const subLines = sub.split('\n').length
        chunks.push({ text: sub, startLine: ln, endLine: ln + subLines - 1 })
        ln += subLines
      }
    } else {
      chunks.push({ text, startLine: lineOffset, endLine: lineOffset + paraLines - 1 })
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

export async function ingestFile(input: IngestFileInput): Promise<IngestResult> {
  const db = getDb()
  const { workspace_id, project_id, file_path, content, language } = input

  const lang = language?.toLowerCase()
  const isSyntax = lang !== undefined && CODE_LANGUAGES.has(lang)
  const chunkStrategy = isSyntax ? 'syntax' : 'semantic'
  const sourceType = isSyntax ? 'code' : 'prose'
  const memoryKind = isSyntax ? 'symbol' : 'doc'

  const rawChunks = isSyntax ? chunkSyntax(content) : chunkSemantic(content)

  let chunks_created = 0
  let memories_created = 0

  for (const chunk of rawChunks) {
    const hash = contentHash(chunk.text)
    const symbolPath = 'symbolPath' in chunk ? chunk.symbolPath : null

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
      await writeMemory({
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
    }
  }

  return { chunks_created, memories_created }
}

function walkDir(dir: string, extensions: Set<string>): string[] {
  const result: string[] = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        // Skip node_modules and hidden dirs
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        result.push(...walkDir(full, extensions))
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
