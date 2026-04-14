// packages/memory/src/mappers.ts
import type { FullMemory } from './types.js'

export function rowToFullMemory(row: Record<string, unknown>): FullMemory {
  return {
    memory_id: row.memory_id as string,
    scope: row.scope as FullMemory['scope'],
    kind: row.kind as FullMemory['kind'],
    workspace_id: row.workspace_id as string,
    project_id: row.project_id as string | null,
    file_path: row.file_path as string | null,
    symbol_path: row.symbol_path as string | null,
    title: row.title as string,
    summary: row.summary as string,
    canonical_text: row.canonical_text as string | null,
    tags: (() => { try { return JSON.parse(row.tags as string) as string[] } catch { return [] } })(),
    entities: (() => { try { return JSON.parse(row.entities as string) as string[] } catch { return [] } })(),
    confidence: row.confidence as number,
    freshness: row.freshness as number,
    importance: (row.importance as number) ?? 0.5,
    access_count: row.access_count as number,
    event_time: row.event_time as string | null,
    content_hash: row.content_hash as string | null,
    task_id: row.task_id as string | null,
    issue_id: row.issue_id as string | null,
    artifact_id: row.artifact_id as string | null,
    provenance_refs: (() => { try { return JSON.parse(row.provenance_refs as string) as string[] } catch { return [] } })(),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    last_accessed_at: row.last_accessed_at as string,
  }
}
