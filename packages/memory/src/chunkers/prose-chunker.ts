// v2a PR 3 Task 15 — prose chunker for markdown + structured config files.
//
// Markdown: heading-aware splitting with ~10% overlap so cross-heading
// context survives a chunk boundary (RAG best practice — the next chunk
// includes the last paragraph of the previous one).
// Configs (json, yaml, toml): chunk by top-level key. Each top-level entry
// becomes a chunk so retrieval can pinpoint the relevant section without
// shipping the whole config.
//
// Emits Chunk[] with kind='prose'. PR 4's PCI watcher routes md/json/yaml/
// toml files to this chunker; everything else goes to the AST chunker
// fallback chain.

import type { Chunk, Chunker } from './types.js'

const MARKDOWN_HEADING_RE = /^(#{1,6})\s+(.+)$/
const OVERLAP_RATIO = 0.1
const MIN_CHUNK_SIZE = 200
const MAX_CHUNK_SIZE = 4000

export type ProseFileKind = 'markdown' | 'json' | 'yaml' | 'toml'

export function detectProseKind(filename: string): ProseFileKind | null {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.mdx')) return 'markdown'
  if (lower.endsWith('.json') || lower.endsWith('.jsonc')) return 'json'
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml'
  if (lower.endsWith('.toml')) return 'toml'
  return null
}

export class ProseChunker implements Chunker {
  constructor(private readonly kind: ProseFileKind = 'markdown') {}

  chunk(source: string): Chunk[] {
    if (!source.trim()) return []
    if (this.kind === 'markdown') return chunkMarkdown(source)
    if (this.kind === 'json') return chunkJson(source)
    if (this.kind === 'toml') return chunkTopLevelKeyed(source, 'toml')
    return chunkTopLevelKeyed(source, 'yaml')
  }
}

function chunkMarkdown(source: string): Chunk[] {
  const lines = source.split(/\r?\n/)
  const chunks: Chunk[] = []
  let currentLines: string[] = []
  let currentStartLine = 1
  let currentStartByte = 0
  let cursor = 0

  const flushChunk = (endByte: number, endLine: number) => {
    const text = currentLines.join('\n')
    if (!text.trim()) return
    chunks.push({
      text,
      start: currentStartByte,
      end: endByte,
      kind: 'prose',
      startLine: currentStartLine,
      endLine,
    })
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const lineByteLength = line.length + 1 // +1 for newline
    const isHeading = MARKDOWN_HEADING_RE.test(line)
    const accumulated = currentLines.join('\n')

    if (isHeading && accumulated.trim() && (accumulated.length >= MIN_CHUNK_SIZE || chunks.length === 0)) {
      flushChunk(cursor, i)
      // Overlap: carry the last few lines of the prior chunk into the next
      const overlapLineCount = Math.max(1, Math.floor(currentLines.length * OVERLAP_RATIO))
      const overlapLines = currentLines.slice(-overlapLineCount)
      currentLines = [...overlapLines, line]
      currentStartByte = Math.max(0, cursor - overlapLines.join('\n').length)
      currentStartLine = Math.max(1, i + 1 - overlapLineCount)
    } else {
      currentLines.push(line)
    }

    cursor += lineByteLength

    if (currentLines.join('\n').length >= MAX_CHUNK_SIZE) {
      flushChunk(cursor, i + 1)
      currentLines = []
      currentStartByte = cursor
      currentStartLine = i + 2
    }
  }

  if (currentLines.length > 0) flushChunk(source.length, lines.length)
  if (chunks.length === 0) {
    chunks.push({
      text: source,
      start: 0,
      end: source.length,
      kind: 'prose',
      startLine: 1,
      endLine: lines.length,
    })
  }
  return chunks
}

function chunkJson(source: string): Chunk[] {
  // Naive top-level key splitter — handles well-formed JSON objects whose
  // top-level entries are formatted one per line group. For pretty-printed
  // configs this works; for minified JSON it returns a single chunk.
  const lines = source.split(/\r?\n/)
  const chunks: Chunk[] = []
  const TOP_KEY_RE = /^\s*"([^"]+)"\s*:/

  let currentLines: string[] = []
  let currentStartLine = 1
  let cursor = 0
  let chunkStartByte = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const isTopKey = TOP_KEY_RE.test(line)
    if (isTopKey && currentLines.length > 0) {
      const text = currentLines.join('\n')
      if (text.trim()) {
        chunks.push({ text, start: chunkStartByte, end: cursor, kind: 'prose', startLine: currentStartLine, endLine: i })
      }
      currentLines = []
      chunkStartByte = cursor
      currentStartLine = i + 1
    }
    currentLines.push(line)
    cursor += line.length + 1
  }
  if (currentLines.length > 0) {
    const text = currentLines.join('\n')
    if (text.trim()) chunks.push({ text, start: chunkStartByte, end: source.length, kind: 'prose', startLine: currentStartLine, endLine: lines.length })
  }
  if (chunks.length === 0) chunks.push({ text: source, start: 0, end: source.length, kind: 'prose', startLine: 1, endLine: lines.length })
  return chunks
}

function chunkTopLevelKeyed(source: string, mode: 'yaml' | 'toml'): Chunk[] {
  // YAML — chunk on column-0 `key:` lines. TOML — chunk on `[section]` headers
  // only (key = value lines stay grouped under their section).
  const lines = source.split(/\r?\n/)
  const chunks: Chunk[] = []
  const YAML_TOP_KEY_RE = /^[A-Za-z_][\w-]*\s*:/
  const TOML_SECTION_RE = /^\[[^\]]+\]\s*$/
  const isBoundary = (line: string): boolean =>
    mode === 'toml' ? TOML_SECTION_RE.test(line) : YAML_TOP_KEY_RE.test(line)

  let currentLines: string[] = []
  let currentStartLine = 1
  let cursor = 0
  let chunkStartByte = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (isBoundary(line) && currentLines.length > 0) {
      const text = currentLines.join('\n')
      if (text.trim()) chunks.push({ text, start: chunkStartByte, end: cursor, kind: 'prose', startLine: currentStartLine, endLine: i })
      currentLines = []
      chunkStartByte = cursor
      currentStartLine = i + 1
    }
    currentLines.push(line)
    cursor += line.length + 1
  }
  if (currentLines.length > 0) {
    const text = currentLines.join('\n')
    if (text.trim()) chunks.push({ text, start: chunkStartByte, end: source.length, kind: 'prose', startLine: currentStartLine, endLine: lines.length })
  }
  if (chunks.length === 0) chunks.push({ text: source, start: 0, end: source.length, kind: 'prose', startLine: 1, endLine: lines.length })
  return chunks
}
