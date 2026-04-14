// packages/memory/src/vault/formatter.ts
import matter from 'gray-matter'
import type { FullMemory, MemoryFileFrontmatter } from '../types.js'

export function serializeToFile(memory: FullMemory, body: string): string {
  const frontmatter: MemoryFileFrontmatter = {
    id: memory.memory_id,
    schema: 'fulcrum.memory/v1',
    kind: memory.kind,
    scope: memory.scope,
    workspace_id: memory.workspace_id,
    project_id: memory.project_id ?? undefined,
    file_path: memory.file_path ?? undefined,
    symbol_path: memory.symbol_path ?? undefined,
    title: memory.title,
    summary: memory.summary,
    tags: memory.tags.length > 0 ? memory.tags : undefined,
    confidence: memory.confidence,
    importance: memory.importance,
    freshness: memory.freshness,
    created_at: memory.created_at,
    updated_at: memory.updated_at,
    event_time: memory.event_time ?? undefined,
    task_id: memory.task_id ?? undefined,
    issue_id: memory.issue_id ?? undefined,
    artifact_id: memory.artifact_id ?? undefined,
    entities: memory.entities.length > 0 ? memory.entities : undefined,
    provenance_refs: memory.provenance_refs.length > 0 ? memory.provenance_refs : undefined,
    content_hash: memory.content_hash ?? undefined,
  }

  // Remove undefined values so gray-matter does not emit null yaml keys
  const cleanFm: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(frontmatter)) {
    if (v !== undefined) cleanFm[k] = v
  }

  return matter.stringify(body, cleanFm)
}

export function parseFromFile(fileContent: string): { frontmatter: MemoryFileFrontmatter; body: string } {
  const parsed = matter(fileContent)
  const fm = parsed.data as MemoryFileFrontmatter

  if (!fm.id) throw new Error('Memory file missing required field: id')
  if (!fm.schema) throw new Error('Memory file missing required field: schema')
  if (!fm.kind) throw new Error('Memory file missing required field: kind')
  if (!fm.scope) throw new Error('Memory file missing required field: scope')
  if (!fm.workspace_id) throw new Error('Memory file missing required field: workspace_id')
  if (!fm.title) throw new Error('Memory file missing required field: title')

  return {
    frontmatter: fm,
    body: parsed.content.trim(),
  }
}
