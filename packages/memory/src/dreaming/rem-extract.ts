// v2b PR 11 Task 2.1 — REM entity extraction.
//
// NLP-light: regex + entity-list lookup. No LLM call.
// Clusters short-term memories by FTS similarity and extracts entity mentions
// (files, libraries, services, decisions).

export interface MemoryRow {
  memory_id: string
  slug: string
  content: string
  scope: string
  recall_count: number
  unique_query_count: number
  max_recall_score: number
}

export type EntityType = 'file' | 'library' | 'service' | 'decision' | 'symbol' | 'person'

export interface RemEntity {
  type: EntityType
  name: string
  /** memory IDs where this entity was mentioned */
  sourceIds: string[]
}

export interface RemExtractResult {
  entities: RemEntity[]
}

// Regex for common file path patterns (relative paths with extension)
const FILE_RE = /(?:^|[\s"'`(])([a-zA-Z0-9_./-]+\/[a-zA-Z0-9_.-]+\.[a-zA-Z]{1,6})(?:[\s"'`),]|$)/gm

// Well-known library names to detect
const KNOWN_LIBRARIES = new Set([
  'better-sqlite3', 'kuzu', 'vitest', 'typescript', 'tsup', 'eslint',
  'react', 'express', 'fastify', 'next.js', 'nextjs', 'prisma',
  'sqlite-vec', 'vite', 'zod', 'openai', 'anthropic', 'chokidar',
  'simple-git', 'ulidx', 'gray-matter',
])

// Decision markers
const DECISION_RE = /\b(?:Decision|ADR|Decided|Chose|Selected|Adopted)[:.,]/i

export function extractEntitiesFromMemories(memories: MemoryRow[]): RemExtractResult {
  const fileMap = new Map<string, Set<string>>()    // name → set of memory_ids
  const libMap = new Map<string, Set<string>>()
  const decisionMap = new Map<string, Set<string>>()

  for (const mem of memories) {
    const content = mem.content

    // File mentions
    let m: RegExpExecArray | null
    FILE_RE.lastIndex = 0
    while ((m = FILE_RE.exec(content)) !== null) {
      const name = m[1]!.trim()
      if (!fileMap.has(name)) fileMap.set(name, new Set())
      fileMap.get(name)!.add(mem.memory_id)
    }

    // Library mentions
    for (const lib of KNOWN_LIBRARIES) {
      if (content.includes(lib)) {
        if (!libMap.has(lib)) libMap.set(lib, new Set())
        libMap.get(lib)!.add(mem.memory_id)
      }
    }

    // Decision mentions
    if (DECISION_RE.test(content)) {
      const key = `decision:${mem.memory_id}`
      decisionMap.set(key, new Set([mem.memory_id]))
    }
  }

  const entities: RemEntity[] = []

  for (const [name, ids] of fileMap) {
    entities.push({ type: 'file', name, sourceIds: [...ids] })
  }
  for (const [name, ids] of libMap) {
    entities.push({ type: 'library', name, sourceIds: [...ids] })
  }
  for (const [, ids] of decisionMap) {
    entities.push({ type: 'decision', name: `decision:${[...ids][0]}`, sourceIds: [...ids] })
  }

  return { entities }
}
